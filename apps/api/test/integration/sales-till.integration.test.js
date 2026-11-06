import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createTillRoutes } from '../../src/features/sales/till.routes.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

const MAX_HELD = 3;

/** @type {Awaited<ReturnType<typeof startTestDatabase>>} */
let db;
/** @type {import('express').Express} */
let app;
/** @type {Record<string, number>} */
const ids = {};

beforeAll(async () => {
  db = await startTestDatabase();
  const config = loadConfig({
    ...TEST_ENV,
    DATABASE_URL: db.url,
    SALES_MAX_HELD: String(MAX_HELD),
  });
  const logger = pino({ level: 'silent' });
  const audit = createAuditLog(db.prisma, logger);
  const auth = createAuthModule({
    config,
    prisma: db.prisma,
    counters: db.redis,
    redis: db.redis,
    logger,
    audit,
    mailer: { send: async () => {} },
  });
  app = buildTestApp({
    prisma: db.prisma,
    redis: db.redis,
    routes: collectRoutes({
      auth,
      sales: { routes: createTillRoutes({ prisma: db.prisma, audit, config }) },
    }),
    guards: auth.guards,
  });

  // Made-up stock: one item with three batches (one expired, one sold out), and a second item.
  await db.prisma
    .$executeRaw`INSERT INTO items_generic_names (GENERIC_NAME, ACTIVE_S) VALUES ('Testamolum', 'Y')`;
  const [generic] =
    await db.select`SELECT ITEM_GENERIC_NAME_ID AS id FROM items_generic_names WHERE GENERIC_NAME = 'Testamolum'`;
  await db.prisma.$executeRaw`
    INSERT INTO items (ITEM_NM, ITEM_CD, ITEM_GENERIC_NAME_ID, ACTIVE_S)
    VALUES ('Testamol 500mg', 'TST500', ${generic.id}, 'Y'), ('Samplocillin 250mg', 'SMP250', NULL, 'Y'),
           ('Demo 100% Syrup', 'DEMO1', NULL, 'Y')`;
  const items =
    await db.select`SELECT ITEM_ID AS id, ITEM_CD AS code FROM items WHERE ITEM_CD IN ('TST500', 'SMP250', 'DEMO1')`;
  const item = Object.fromEntries(items.map((row) => [row.code, row.id]));
  await db.prisma.$executeRaw`
    INSERT INTO stock (ITEM_ID, PHARMACY_ID, QUANTITY, BATCH_NO, BARCODE, EXPIRY_DT, UNIT_SALE_RATE, UNIT_PURCHASE_RATE)
    VALUES (${item.TST500}, 1, 40, 'LATE', '6001234500011', '2031-06-30', 116, 80),
           (${item.TST500}, 1, 10, 'EARLY', '6001234500011', '2030-01-31', 116, 80),
           (${item.TST500}, 1, 5, 'OLD', '6001234500011', '2020-01-31', 116, 80),
           (${item.TST500}, 1, 0, 'EMPTY', '6001234500011', '2032-01-31', 116, 80),
           (${item.SMP250}, 1, 50, 'SMP-1', NULL, '2030-12-31', 20.25, 15),
           (${item.DEMO1}, 1, 7, 'DEMO-1', NULL, '2030-12-31', 99, 50)`;
  for (const row of await db.select`SELECT STOCK_ID AS id, BATCH_NO AS batch FROM stock`)
    ids[row.batch] = row.id;

  await db.prisma.$executeRaw`
    INSERT INTO customer (FIRST_NM, LAST_NM, PHONE_NBR, ACTIVE_S)
    VALUES ('Example', 'Customer', '0700000001', 'Y'), ('Sample', 'Shopper', '0700000002', 'Y'),
           ('Example', 'Inactive', '0700000003', 'N')`;
});

afterAll(async () => {
  await db?.stop();
});

/**
 * @param {string} identifier
 * @param {string} password
 */
async function signIn(identifier, password) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({ identifier, password });
  return { agent, csrf: /** @type {string} */ (response.body.data?.csrfToken) };
}

describe('the till', () => {
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let cashier;
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let otherTill;

  beforeAll(async () => {
    cashier = await signIn('test.cashier', 'Test-Cashier-Pass-1');
    otherTill = await signIn('test.cashier', 'Test-Cashier-Pass-1');
  });

  /** @param {Record<string, unknown>} body */
  const hold = (body) =>
    cashier.agent.post('/api/v1/sales/held').set('x-csrf-token', cashier.csrf).send(body);

  it('finds batches in stock by name, first to expire first, expired ones last and marked', async () => {
    const response = await cashier.agent.get('/api/v1/sales/batches').query({ q: 'testa' });
    expect(response.status).toBe(200);
    expect(response.body.data.scanned).toBe(false);
    const batches = response.body.data.batches;
    expect(batches.map((/** @type {any} */ b) => [b.batchNo, b.expired])).toEqual([
      ['EARLY', false],
      ['LATE', false],
      ['OLD', true],
    ]);
    expect(batches[0]).toMatchObject({
      itemName: 'Testamol 500mg',
      genericName: 'Testamolum',
      available: 10,
      labelPrice: '116.00',
    });
    expect(batches[0]).not.toHaveProperty('unitCost');
  });

  it('finds by item code, generic name and batch number, and matches % literally', async () => {
    const find = async (/** @type {string} */ q) =>
      (await cashier.agent.get('/api/v1/sales/batches').query({ q })).body.data.batches.map(
        (/** @type {any} */ b) => b.batchNo,
      );
    expect(await find('smp')).toEqual(['SMP-1']);
    expect(await find('testamolum')).toEqual(['EARLY', 'LATE', 'OLD']);
    expect(await find('demo-')).toEqual(['DEMO-1']);
    expect(await find('100%')).toEqual(['DEMO-1']);
    expect(await find('%')).toEqual([]);
  });

  it('treats an exact barcode as a scan and lists every batch of that item', async () => {
    const response = await cashier.agent.get('/api/v1/sales/batches').query({ q: '6001234500011' });
    expect(response.body.data.scanned).toBe(true);
    expect(response.body.data.batches[0].batchNo).toBe('EARLY');
  });

  it('finds active customers by name or phone', async () => {
    const byName = await cashier.agent.get('/api/v1/sales/customers').query({ q: 'exam' });
    expect(byName.body.data).toEqual([
      { id: expect.any(Number), name: 'Example Customer', phone: '0700000001' },
    ]);
    const byPhone = await cashier.agent.get('/api/v1/sales/customers').query({ q: '0700 000 002' });
    expect(byPhone.body.data.map((/** @type {any} */ c) => c.name)).toEqual(['Sample Shopper']);
    const byWords = await cashier.agent.get('/api/v1/sales/customers').query({ q: 'sam sho' });
    expect(byWords.body.data.map((/** @type {any} */ c) => c.name)).toEqual(['Sample Shopper']);
    // Words match the start of a name, not its middle.
    const inside = await cashier.agent.get('/api/v1/sales/customers').query({ q: 'xample' });
    expect(inside.body.data).toEqual([]);
    const tooShort = await cashier.agent.get('/api/v1/sales/customers').query({ q: 'e' });
    expect(tooShort.status).toBe(400);
  });

  it('holds a sale, lists it with its total, and lets only one till recall it', async () => {
    const held = await hold({
      lines: [
        { stockId: ids.EARLY, quantity: 2 },
        { stockId: ids['SMP-1'], quantity: 1, discountPercent: 10 },
      ],
      customerName: 'Test Walk-in',
      note: 'Fetching money',
    });
    expect(held.status).toBe(201);
    expect(held.body.data).toMatchObject({
      customerName: 'Test Walk-in',
      note: 'Fetching money',
      lineCount: 2,
      net: '250.00',
      heldBy: 'Carl Cashier',
    });
    expect(Math.abs(Date.parse(held.body.data.heldAt) - Date.now())).toBeLessThan(120_000);

    const list = await otherTill.agent.get('/api/v1/sales/held');
    expect(list.body.data.map((/** @type {any} */ h) => h.id)).toEqual([held.body.data.id]);

    const recall = (/** @type {Awaited<ReturnType<typeof signIn>>} */ till) =>
      till.agent
        .post(`/api/v1/sales/held/${held.body.data.id}/recall`)
        .set('x-csrf-token', till.csrf);
    const results = await Promise.all([recall(cashier), recall(otherTill)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 404]);
    const recalled = /** @type {any} */ (results.find((result) => result.status === 200)).body.data;
    expect(recalled).toMatchObject({
      customerName: 'Test Walk-in',
      lines: [
        { stockId: ids.EARLY, quantity: 2, discountPercent: 0 },
        { stockId: ids['SMP-1'], quantity: 1, discountPercent: 10 },
      ],
    });
    expect((await cashier.agent.get('/api/v1/sales/held')).body.data).toEqual([]);
  });

  it('puts a registered customer on a held sale by name', async () => {
    const [customer] = (await cashier.agent.get('/api/v1/sales/customers').query({ q: 'sample' }))
      .body.data;
    const held = await hold({
      lines: [{ stockId: ids['SMP-1'], quantity: 1 }],
      customerId: customer.id,
    });
    expect(held.body.data.customerName).toBe('Sample Shopper');
    const missing = await hold({
      lines: [{ stockId: ids['SMP-1'], quantity: 1 }],
      customerId: 999999,
    });
    expect(missing.status).toBe(400);
  });

  it('discards a held sale once, and refuses more than the limit on hold', async () => {
    const one = await hold({ lines: [{ stockId: ids['SMP-1'], quantity: 1 }] });
    await hold({ lines: [{ stockId: ids['SMP-1'], quantity: 1 }] });
    const full = await hold({ lines: [{ stockId: ids['SMP-1'], quantity: 1 }] });
    expect(full.status).toBe(409);
    expect(full.body.error.message).toBe(
      `${MAX_HELD} sales are already on hold. Recall or discard one first.`,
    );

    const discard = () =>
      cashier.agent
        .delete(`/api/v1/sales/held/${one.body.data.id}`)
        .set('x-csrf-token', cashier.csrf);
    expect((await discard()).status).toBe(204);
    expect((await discard()).status).toBe(404);
    const [audit] =
      await db.select`SELECT ACTION AS action FROM ih_audit_log WHERE ACTION = 'sales/held.discard'`;
    expect(audit.action).toBe('sales/held.discard');
  });

  it('refuses a held sale with a batch that does not exist', async () => {
    const response = await hold({ lines: [{ stockId: 999999, quantity: 1 }] });
    expect(response.status).toBe(400);
  });

  it('tells the till the rules it shows', async () => {
    const response = await cashier.agent.get('/api/v1/sales/till-settings');
    expect(response.body.data).toEqual({
      selfDiscountLimit: 25,
      maxHeld: MAX_HELD,
      quickCashNotes: [50, 100, 200, 500, 1000],
      chequeMaxAgeMonths: 6,
      canAcceptCheques: false,
      cancelAloneMinutes: 10,
      approvalReasons: ['Regular customer', 'Price match', 'Near expiry', 'Staff purchase'],
      cancelReasons: ['Wrong item', 'Customer changed mind', 'Payment failed'],
    });
    const banks = await cashier.agent.get('/api/v1/sales/banks');
    expect(banks.body.data.map((/** @type {any} */ bank) => bank.name)).toContain('KCB Bank');
  });

  it('refuses people who may not sell', async () => {
    const admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    expect((await admin.agent.get('/api/v1/sales/batches').query({ q: 'testa' })).status).toBe(403);
    expect((await admin.agent.get('/api/v1/sales/held')).status).toBe(403);
  });
});
