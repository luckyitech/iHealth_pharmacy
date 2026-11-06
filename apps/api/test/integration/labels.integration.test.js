import { randomUUID } from 'node:crypto';

import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createSalesBillRoutes } from '../../src/features/sales/bills.routes.js';
import { createLabelRoutes } from '../../src/features/sales/labels.routes.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

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
  const deps = { prisma: db.prisma, audit, config };
  app = buildTestApp({
    prisma: db.prisma,
    redis: db.redis,
    routes: collectRoutes({
      auth,
      sales: { routes: [...createSalesBillRoutes(deps), ...createLabelRoutes(deps)] },
    }),
    guards: auth.guards,
  });

  await db.prisma
    .$executeRaw`INSERT INTO generateuniquecode (UNIQUE_CODE_NAME, UNIQUE_CODE_NUMBER) VALUES ('SB', 0)`;
  await db.prisma
    .$executeRaw`INSERT INTO account_type (ACCOUNT_TYPE_ID, ACCOUNT_TYPE) VALUES (18, 'Till (9900-9999)')`;
  await db.prisma
    .$executeRaw`INSERT INTO chart_of_accounts (ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, CURRENT_BALANCE, PHARMACY_ID) VALUES (63, 'Sales Till', 18, 0, 1)`;
  await db.prisma.$executeRaw`
    INSERT INTO schedule_category_code (SCHEDULE_CATEGORY_CODE, ACTIVE_S) VALUES ('H1', 'Y')`;
  const [code] =
    await db.select`SELECT SCHEDULE_CATEGORY_CODE_ID AS id FROM schedule_category_code`;
  await db.prisma.$executeRaw`
    INSERT INTO items (ITEM_NM, ITEM_CD, SCHEDULE_CATEGORY_CODE_ID, ACTIVE_S)
    VALUES ('Amoxidemo 250mg caps', 'AMX250', ${code.id}, 'Y'), ('Testamol 500mg', 'TST500', NULL, 'Y')`;
  for (const row of await db.select`SELECT ITEM_ID AS id, ITEM_CD AS code FROM items`)
    ids[row.code] = row.id;
  await db.prisma.$executeRaw`
    INSERT INTO stock (ITEM_ID, PHARMACY_ID, QUANTITY, BATCH_NO, EXPIRY_DT, UNIT_SALE_RATE, UNIT_PURCHASE_RATE)
    VALUES (${ids.AMX250}, 1, 50, 'AX-1', '2027-08-31', 380, 200), (${ids.TST500}, 1, 50, 'TS-1', '2030-01-31', 116, 80)`;
  for (const row of await db.select`SELECT STOCK_ID AS id, BATCH_NO AS batch FROM stock`)
    ids[row.batch] = row.id;
  // Made-up label codes, and an instruction the legacy app kept for one item.
  await db.prisma.$executeRaw`
    INSERT INTO formulation_instructions (FORMULATION_NAME, INSTRUCTIONS, ITEM_ID, ACTIVE_S)
    VALUES ('1c', 'Take one capsule', NULL, 'Y'), ('tds', '3 times a day', NULL, 'Y'),
           ('old', 'No longer used', NULL, 'N'),
           ('AMX', 'Take one capsule 3 times a day for 5 days', ${ids.AMX250}, 'Y')`;
});

afterAll(async () => {
  await db?.stop();
});

describe('dosing labels', () => {
  /** @type {{ agent: import('supertest').Agent, csrf: string }} */
  let cashier;
  /** @type {any} */
  let bill;

  beforeAll(async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'test.cashier', password: 'Test-Cashier-Pass-1' });
    cashier = { agent, csrf: login.body.data.csrfToken };
    const sale = await agent
      .post('/api/v1/sales/bills')
      .set('x-csrf-token', cashier.csrf)
      .send({
        requestKey: randomUUID(),
        customerName: 'Jane Testcase',
        lines: [
          { stockId: ids['AX-1'], quantity: 15 },
          { stockId: ids['TS-1'], quantity: 1 },
        ],
        payments: [{ method: 'cash', amount: '6000' }],
      });
    expect(sale.status).toBe(201);
    bill = sale.body.data;
  });

  it('offers the active label codes', async () => {
    const response = await cashier.agent.get('/api/v1/sales/label-codes');
    expect(response.body.data).toEqual([
      { code: '1c', text: 'Take one capsule' },
      { code: 'tds', text: '3 times a day' },
    ]);
  });

  it("lists the bill's lines with the item's usual instruction", async () => {
    const response = await cashier.agent.get(`/api/v1/sales/bills/${bill.id}/labels`);
    expect(response.body.data).toMatchObject({ billId: bill.id, printedBefore: false });
    expect(response.body.data.lines).toEqual([
      expect.objectContaining({
        itemName: 'Amoxidemo 250mg caps',
        batchNo: 'AX-1',
        expiryDate: '2027-08-31',
        quantity: 15,
        medicineKind: 'antibiotic',
        suggestedText: 'Take one capsule 3 times a day for 5 days',
        savedText: null,
      }),
      expect.objectContaining({
        itemName: 'Testamol 500mg',
        medicineKind: null,
        suggestedText: null,
      }),
    ]);
  });

  it('prints the stickers, keeps what was printed, and reprints it the same', async () => {
    const [amox, testamol] = bill.lines;
    const printed = await cashier.agent
      .post(`/api/v1/sales/bills/${bill.id}/labels`)
      .set('x-csrf-token', cashier.csrf)
      .send({
        labels: [
          {
            lineId: amox.id,
            text: 'Take one capsule 3 times a day. Finish the course.',
            copies: 2,
          },
          { lineId: testamol.id, text: '', copies: 0 },
        ],
      })
      .buffer(true);
    expect(printed.status).toBe(200);
    expect(printed.headers['content-type']).toBe('application/pdf');

    const lines = (await cashier.agent.get(`/api/v1/sales/bills/${bill.id}/labels`)).body.data;
    expect(lines.printedBefore).toBe(true);
    expect(lines.lines[0]).toMatchObject({
      savedText: 'Take one capsule 3 times a day. Finish the course.',
      savedCopies: 2,
    });
    expect(lines.lines[1]).toMatchObject({ savedText: null, savedCopies: null });

    const again = await cashier.agent.get(`/api/v1/sales/bills/${bill.id}/labels/pdf`).buffer(true);
    expect(again.status).toBe(200);
    const audited = await db.select`
      SELECT ACTION AS action FROM ih_audit_log
      WHERE ACTION LIKE 'sales/bills.labels.%' AND RESOURCE_ID = ${String(bill.id)} ORDER BY AUDIT_LOG_ID`;
    expect(audited.map((/** @type {any} */ row) => row.action)).toEqual([
      'sales/bills.labels.print',
      'sales/bills.labels.reprint',
    ]);
  });

  it('refuses a line from another bill, a sticker without a dose, and nothing to print', async () => {
    /** @param {Record<string, unknown>} body */
    const print = (body) =>
      cashier.agent
        .post(`/api/v1/sales/bills/${bill.id}/labels`)
        .set('x-csrf-token', cashier.csrf)
        .send(body);
    expect(
      (await print({ labels: [{ lineId: 999999, text: 'Take one', copies: 1 }] })).status,
    ).toBe(400);
    expect(
      (await print({ labels: [{ lineId: bill.lines[0].id, text: '', copies: 1 }] })).status,
    ).toBe(400);
    expect(
      (await print({ labels: [{ lineId: bill.lines[0].id, text: 'x', copies: 0 }] })).status,
    ).toBe(400);
  });
});
