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

  // The legacy triggers post each cash bill to the "Sales Till" account (63), as in the real data.
  await db.prisma
    .$executeRaw`INSERT INTO account_type (ACCOUNT_TYPE_ID, ACCOUNT_TYPE) VALUES (18, 'Till (9900-9999)')`;
  await db.prisma
    .$executeRaw`INSERT INTO chart_of_accounts (ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, CURRENT_BALANCE, PHARMACY_ID) VALUES (63, 'Sales Till', 18, 0, 1)`;

  // Made-up stock: one item with a batch still valid, one whose batch expired before the sale.
  await db.prisma
    .$executeRaw`INSERT INTO taxcategory (CATEGORY_CODE, CATEGORY_VALUE, ACTIVE_S) VALUES ('A', 16, 'Y')`;
  const [tax] =
    await db.select`SELECT TAXCATEGORY_ID AS id FROM taxcategory WHERE CATEGORY_CODE = 'A'`;
  await db.prisma
    .$executeRaw`INSERT INTO items (ITEM_NM, ITEM_CD, ACTIVE_S) VALUES ('Testamol 500mg', 'TST500', 'Y'), ('Samplocillin 250mg', 'SMP250', 'Y')`;
  const [first, second] =
    await db.select`SELECT ITEM_ID AS id FROM items WHERE ITEM_CD IN ('TST500', 'SMP250') ORDER BY ITEM_CD DESC`;
  await db.prisma
    .$executeRaw`INSERT INTO stock (ITEM_ID, PHARMACY_ID, QUANTITY, BATCH_NO, EXPIRY_DT) VALUES (${first.id}, 1, 100, 'BATCH-OK', '2030-12-31'), (${second.id}, 1, 100, 'BATCH-OLD', '2026-01-31')`;
  const [okBatch, oldBatch] =
    await db.select`SELECT STOCK_ID AS id FROM stock WHERE BATCH_NO IN ('BATCH-OK', 'BATCH-OLD') ORDER BY BATCH_NO`;

  // Three made-up bills: paid by M-Pesa with a short code, cancelled, and on credit without items.
  await db.prisma.$executeRaw`
    INSERT INTO sales (BILL_CODE, BILL_DATE, CUSTOMER_NM, CUSTOMER_PHONE_NO, EMPLOYEE_ID, PHARMACY_ID,
      TOTAL_AMOUNT, OVERALL_DISCOUNT, VAT_AMT, ROUNDED_OFF, NET_AMOUNT, PAID_AMOUNT, BALANCE_AMOUNT,
      PAYMENT_STATUS, UPI_AMOUNT, UPI_TRANS_ID, CASH_AMOUNT, CREDIT_AMOUNT, CREATION_TS, CREATION_USER_ID,
      LAST_UPDATE_TS, LAST_UPDATE_USER_ID)
    VALUES
      ('TSB0102260001', '2026-02-01', 'Test Customer', '0700 000 101', 2, 1, 1160, 0, 160, 0, 1160, 1160, 0,
        'PAID', 1160, 'AB12', NULL, NULL, '2026-02-01 09:15:00', '2', '2026-02-01 09:15:00', '2'),
      ('TSB0102260002', '2026-02-01', 'Sample Buyer', '0700 000 102', 2, 1, 500, 0, 0, 0, 500, 0, 0,
        'Cancel', NULL, NULL, 500, NULL, '2026-02-01 10:00:00', '2', '2026-02-01 10:05:00', '2'),
      ('TSB0202260001', '2026-02-02', 'Demo Account', '0700 000 103', 1, 1, 300, 0, 0, 0, 300, 0, 300,
        'Pending', NULL, NULL, NULL, 300, '2026-02-02 11:00:00', '1', '2026-02-02 11:00:00', '1')`;
  const bills =
    await db.select`SELECT BILL_ID AS id, BILL_CODE AS code FROM sales ORDER BY BILL_CODE`;
  ids.paid = bills[0].id;
  ids.cancelled = bills[1].id;
  ids.credit = bills[2].id;
  await db.prisma.$executeRaw`
    INSERT INTO sales_items (BILL_ID, ITEM_ID, STOCK_ID, SALE_QTY, MRP, UNIT_SALE_PRICE, DISCOUNT_PERCENTAGE,
      VAT, SALE_AMOUNT, BATCH_NO, TAX_CATEGORY_ID)
    VALUES (${ids.paid}, ${first.id}, ${okBatch.id}, 2, 580, 500, 0, 16, 1160, 'BATCH-OK', ${tax.id}),
           (${ids.cancelled}, ${second.id}, ${oldBatch.id}, 1, 500, 500, 0, 0, 500, 'BATCH-OLD', NULL)`;
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
  await agent.post('/api/v1/auth/login').send({ identifier, password });
  return agent;
}

describe('sales history', () => {
  /** @type {import('supertest').Agent} */
  let cashier;

  beforeAll(async () => {
    cashier = await signIn('test.cashier', 'Test-Cashier-Pass-1');
  });

  it('lists bills newest first, with their status, payments and old-data flags', async () => {
    const response = await cashier.get(BILLS);
    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ total: 3 });
    expect(response.body.data.map((/** @type {any} */ bill) => bill.code)).toEqual([
      'TSB0202260001',
      'TSB0102260002',
      'TSB0102260001',
    ]);
    const [credit, cancelled, paid] = response.body.data;
    expect(paid).toMatchObject({
      status: 'paid',
      paymentMethods: ['mpesa'],
      netAmount: '1160.00',
      cashierName: 'Carl Cashier',
      lineCount: 1,
      flags: ['shortMpesaCode'],
    });
    expect(cancelled.status).toBe('cancelled');
    expect(credit).toMatchObject({
      status: 'pending',
      paymentMethods: ['credit'],
      flags: ['noItems'],
    });
  });

  it('searches by bill number, customer or phone, and filters by date, cashier, payment and status', async () => {
    /** @param {string} query */
    const codes = async (query) =>
      (await cashier.get(`${BILLS}?${query}`)).body.data.map(
        (/** @type {any} */ bill) => bill.code,
      );
    expect(await codes('q=sample')).toEqual(['TSB0102260002']);
    expect(await codes('q=000%20103')).toEqual(['TSB0202260001']);
    expect(await codes('q=%25')).toEqual([]);
    expect(await codes('from=2026-02-02')).toEqual(['TSB0202260001']);
    expect(await codes('to=2026-02-01&sort=code')).toEqual(['TSB0102260001', 'TSB0102260002']);
    expect(await codes('cashierId=1')).toEqual(['TSB0202260001']);
    expect(await codes('paymentMethod=mpesa')).toEqual(['TSB0102260001']);
    expect(await codes('status=cancelled')).toEqual(['TSB0102260002']);
    expect((await cashier.get(`${BILLS}?status=unknown`)).status).toBe(400);
  });

  it('shows one bill with its lines, batches, payments and who made it, and audits the view', async () => {
    const response = await cashier.get(`${BILLS}/${ids.paid}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      totals: { gross: '1160.00', vat: '160.00', net: '1160.00', paid: '1160.00', balance: '0.00' },
      payments: [{ method: 'mpesa', amount: '1160.00', reference: 'AB12' }],
      audit: { createdBy: 'Carl Cashier', createdAt: '2026-02-01 09:15:00' },
    });
    expect(response.body.data.lines).toEqual([
      expect.objectContaining({
        itemName: 'Testamol 500mg',
        batchNo: 'BATCH-OK',
        expiryDate: '2030-12-31',
        expiredWhenSold: false,
        quantity: 2,
        unitPrice: '500.00',
        vatPercent: 16,
        taxCode: 'A',
        amount: '1160.00',
      }),
    ]);
    const old = await cashier.get(`${BILLS}/${ids.cancelled}`);
    expect(old.body.data.lines[0]).toMatchObject({ batchNo: 'BATCH-OLD', expiredWhenSold: true });

    const [entry] =
      await db.select`SELECT ACTION AS action FROM ih_audit_log WHERE RESOURCE_ID = ${String(ids.paid)} ORDER BY AUDIT_LOG_ID DESC LIMIT 1`;
    expect(entry.action).toBe('sales/bills.view');
  });

  it('reprints the receipt as a PDF and answers clearly for a missing bill', async () => {
    const receipt = await cashier
      .get(`${BILLS}/${ids.paid}/receipt`)
      .buffer(true)
      .parse((res, done) => {
        /** @type {Buffer[]} */
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toBe('application/pdf');
    expect(receipt.body.subarray(0, 4).toString()).toBe('%PDF');

    const missing = await cashier.get(`${BILLS}/999999`);
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Bill not found' });
  });

  it('lists the cashiers and refuses people without a sales permission', async () => {
    const cashiers = await cashier.get('/api/v1/sales/cashiers');
    expect(cashiers.body.data.map((/** @type {any} */ person) => person.name)).toEqual([
      'Ada Admin',
      'Carl Cashier',
    ]);
    const admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    expect((await admin.get(BILLS)).status).toBe(403);
  });
});
