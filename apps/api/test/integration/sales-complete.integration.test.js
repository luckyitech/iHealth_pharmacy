import { randomUUID } from 'node:crypto';

import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createSalesBillRoutes } from '../../src/features/sales/bills.routes.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

const BILLS = '/api/v1/sales/bills';

/** @type {Awaited<ReturnType<typeof startTestDatabase>>} */
let db;
/** @type {import('express').Express} */
let app;
/** @type {Record<string, number>} */
const ids = {};

beforeAll(async () => {
  db = await startTestDatabase();
  const config = loadConfig({ ...TEST_ENV, DATABASE_URL: db.url });
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
      sales: { routes: createSalesBillRoutes({ prisma: db.prisma, audit, config }) },
    }),
    guards: auth.guards,
  });

  // The bill counter and the "Sales Till" account the legacy triggers post cash to.
  await db.prisma
    .$executeRaw`INSERT INTO generateuniquecode (UNIQUE_CODE_NAME, UNIQUE_CODE_NUMBER) VALUES ('SB', 0)`;
  await db.prisma
    .$executeRaw`INSERT INTO account_type (ACCOUNT_TYPE_ID, ACCOUNT_TYPE) VALUES (18, 'Till (9900-9999)')`;
  await db.prisma
    .$executeRaw`INSERT INTO chart_of_accounts (ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, CURRENT_BALANCE, PHARMACY_ID) VALUES (63, 'Sales Till', 18, 0, 1)`;

  // Made-up stock: a VAT-rated batch, a zero-rated one, an expired one, and one with a single unit.
  await db.prisma
    .$executeRaw`INSERT INTO taxcategory (CATEGORY_CODE, CATEGORY_VALUE, ACTIVE_S) VALUES ('A', 16, 'Y')`;
  const [tax] =
    await db.select`SELECT TAXCATEGORY_ID AS id FROM taxcategory WHERE CATEGORY_CODE = 'A'`;
  await db.prisma
    .$executeRaw`INSERT INTO items (ITEM_NM, ITEM_CD, ACTIVE_S) VALUES ('Testamol 500mg', 'TST500', 'Y'), ('Samplocillin 250mg', 'SMP250', 'Y')`;
  const items =
    await db.select`SELECT ITEM_ID AS id, ITEM_CD AS code FROM items WHERE ITEM_CD IN ('TST500', 'SMP250')`;
  const item = Object.fromEntries(items.map((row) => [row.code, row.id]));
  await db.prisma.$executeRaw`
    INSERT INTO stock (ITEM_ID, PHARMACY_ID, QUANTITY, BATCH_NO, EXPIRY_DT, UNIT_SALE_RATE, MRP, TAX_CATEGORY_ID, UNIT_PURCHASE_RATE, PURCHASE_DISCOUNT_PERCENTAGE)
    VALUES (${item.TST500}, 1, 100, 'VAT-OK', '2030-12-31', 116, 116, ${tax.id}, 80, 0),
           (${item.SMP250}, 1, 50, 'ZERO-OK', '2030-12-31', 20.25, 20.25, NULL, 15, 10),
           (${item.SMP250}, 1, 10, 'EXPIRED', '2020-01-31', 20.25, 20.25, NULL, 15, 0),
           (${item.TST500}, 1, 1, 'LAST-ONE', '2030-12-31', 116, 116, ${tax.id}, 80, 0)`;
  for (const row of await db.select`SELECT STOCK_ID AS id, BATCH_NO AS batch FROM stock`)
    ids[row.batch] = row.id;
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

/**
 * @param {number} stockId
 * @returns {Promise<number>}
 */
const quantityOf = async (stockId) =>
  Number((await db.select`SELECT QUANTITY AS q FROM stock WHERE STOCK_ID = ${stockId}`)[0].q);

describe('completing a sale', () => {
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let cashier;

  beforeAll(async () => {
    cashier = await signIn('test.cashier', 'Test-Cashier-Pass-1');
  });

  /** @param {Record<string, unknown>} body */
  const sell = (body) =>
    cashier.agent
      .post(BILLS)
      .set('x-csrf-token', cashier.csrf)
      .send({ requestKey: randomUUID(), ...body });

  it('saves the bill, its lines and profit in one go, with prices from the batches', async () => {
    const response = await sell({
      customerName: 'Test Customer',
      lines: [
        { stockId: ids['VAT-OK'], quantity: 2 },
        { stockId: ids['ZERO-OK'], quantity: 2, discountPercent: 10 },
      ],
      payments: [{ method: 'cash', amount: '300' }],
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      status: 'paid',
      customerName: 'Test Customer',
      cashierName: 'Carl Cashier',
      paymentMethods: ['cash'],
      totals: { net: '268.00', roundedOff: '-0.45', vat: '32.00', paid: '268.00', balance: '0.00' },
      payments: [{ method: 'cash', amount: '268.00' }],
      change: '32.00',
    });
    expect(response.body.data.code).toMatch(/^DPSB\d{6}0001$/);

    const lines =
      await db.select`SELECT SALE_QTY AS qty, UNIT_SALE_PRICE AS unit, SP_VAT AS label, SALE_AMOUNT AS amount, PNL AS pnl, VAT AS vat FROM sales_items WHERE BILL_ID = ${response.body.data.id} ORDER BY SALES_ITEMS_ID`;
    expect(lines.map((line) => [Number(line.amount), Number(line.pnl), Number(line.vat)])).toEqual([
      [232, 40, 16],
      [36.45, 9.45, 0],
    ]);
  });

  it('takes the stock off once (the legacy trigger) and puts only the cash kept in the till', async () => {
    expect(await quantityOf(ids['VAT-OK'])).toBe(98);
    expect(await quantityOf(ids['ZERO-OK'])).toBe(48);
    const [till] =
      await db.select`SELECT AMOUNT AS amount FROM till_balance ORDER BY TILL_BALANCE_ID DESC LIMIT 1`;
    expect(Number(till.amount)).toBe(268);
  });

  it('returns the same bill for a repeated request instead of selling twice', async () => {
    const body = {
      requestKey: randomUUID(),
      lines: [{ stockId: ids['VAT-OK'], quantity: 1 }],
      payments: [{ method: 'cash', amount: '116' }],
    };
    const first = await cashier.agent.post(BILLS).set('x-csrf-token', cashier.csrf).send(body);
    const second = await cashier.agent.post(BILLS).set('x-csrf-token', cashier.csrf).send(body);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await quantityOf(ids['VAT-OK'])).toBe(97);
  });

  it('takes M-Pesa with its full code, in capitals, and refuses the same code twice', async () => {
    const paid = await sell({
      lines: [{ stockId: ids['VAT-OK'], quantity: 1 }],
      payments: [
        { method: 'mpesa', amount: '100', reference: 'qk52ab1xyz' },
        { method: 'cash', amount: '16' },
      ],
    });
    expect(paid.status).toBe(201);
    expect(paid.body.data.payments).toEqual([
      { method: 'cash', amount: '16.00', reference: null },
      { method: 'mpesa', amount: '100.00', reference: 'QK52AB1XYZ' },
    ]);
    const again = await sell({
      lines: [{ stockId: ids['VAT-OK'], quantity: 1 }],
      payments: [{ method: 'mpesa', amount: '116', reference: 'QK52AB1XYZ' }],
    });
    expect(again.status).toBe(400);
    expect(again.body.error.details[0]).toMatchObject({
      path: 'body.payments.0.reference',
      message: `This M-Pesa code is already on bill ${paid.body.data.code}`,
    });
    const short = await sell({
      lines: [{ stockId: ids['VAT-OK'], quantity: 1 }],
      payments: [{ method: 'mpesa', amount: '116', reference: 'AB12' }],
    });
    expect(short.status).toBe(400);
  });

  it('refuses payments that fall short, and M-Pesa above the bill', async () => {
    const short = await sell({
      lines: [{ stockId: ids['VAT-OK'], quantity: 1 }],
      payments: [{ method: 'cash', amount: '100' }],
    });
    expect(short.status).toBe(400);
    expect(short.body.error.details).toEqual([
      { path: 'body.payments', message: 'The payments are 16.00 short of the bill' },
    ]);
    const over = await sell({
      lines: [{ stockId: ids['VAT-OK'], quantity: 1 }],
      payments: [{ method: 'mpesa', amount: '200', reference: 'ZZ99AB1XYZ' }],
    });
    expect(over.status).toBe(400);
    expect(over.body.error.details[0].message).toBe('M-Pesa cannot be more than the bill');
  });

  it('refuses expired batches, more units than in stock, and discounts above the limit', async () => {
    const before = await quantityOf(ids.EXPIRED);
    const response = await sell({
      lines: [
        { stockId: ids.EXPIRED, quantity: 1 },
        { stockId: ids['LAST-ONE'], quantity: 2 },
        { stockId: ids['ZERO-OK'], quantity: 1, discountPercent: 30 },
      ],
      payments: [{ method: 'cash', amount: '1000' }],
    });
    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([
      { path: 'body.lines.0.stockId', message: 'This batch has expired and cannot be sold' },
      { path: 'body.lines.1.quantity', message: 'Only 1 left in this batch' },
      {
        path: 'body.lines.2.discountPercent',
        message: "Discounts above 25% need a second person's approval",
      },
    ]);
    expect(await quantityOf(ids.EXPIRED)).toBe(before);
  });

  it('sells the last unit to one till only when two try at once', async () => {
    const attempt = () =>
      sell({
        lines: [{ stockId: ids['LAST-ONE'], quantity: 1 }],
        payments: [{ method: 'cash', amount: '116' }],
      });
    const results = await Promise.all([attempt(), attempt()]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(await quantityOf(ids['LAST-ONE'])).toBe(0);
  });

  it('prints the original receipt once, for the cashier who made the bill, then copies', async () => {
    const sale = await sell({
      lines: [{ stockId: ids['ZERO-OK'], quantity: 1 }],
      payments: [{ method: 'cash', amount: '20' }],
    });
    const print = () =>
      cashier.agent.get(`${BILLS}/${sale.body.data.id}/receipt`).query({ original: 'true' });
    expect((await print()).headers['content-type']).toBe('application/pdf');
    await print();
    const actions =
      await db.select`SELECT ACTION AS action FROM ih_audit_log WHERE RESOURCE_ID = ${String(sale.body.data.id)} AND ACTION LIKE 'sales/bills.%print' ORDER BY AUDIT_LOG_ID`;
    expect(actions.map((row) => row.action)).toEqual(['sales/bills.print', 'sales/bills.reprint']);
  });

  it('refuses people who may not sell', async () => {
    const admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    const response = await admin.agent
      .post(BILLS)
      .set('x-csrf-token', admin.csrf)
      .send({
        requestKey: randomUUID(),
        lines: [{ stockId: ids['VAT-OK'], quantity: 1 }],
        payments: [{ method: 'cash', amount: '116' }],
      });
    expect(response.status).toBe(403);
  });
});
