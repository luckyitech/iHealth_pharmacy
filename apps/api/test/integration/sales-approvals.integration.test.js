import { randomUUID } from 'node:crypto';

import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createApprovalRoutes } from '../../src/features/sales/approvals.routes.js';
import { createSalesBillRoutes } from '../../src/features/sales/bills.routes.js';
import { createSaleQuoteRoutes } from '../../src/features/sales/quote.routes.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

const BILLS = '/api/v1/sales/bills';
const APPROVALS = '/api/v1/sales/approvals';
/** Made-up approval PINs, as the legacy table keeps them (plain text). */
const ADMIN_PIN = '4321';
const OTHER_PIN = '1111';

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
      sales: {
        routes: [
          ...createSalesBillRoutes({ prisma: db.prisma, audit, config }),
          ...createSaleQuoteRoutes({ prisma: db.prisma, config }),
          ...createApprovalRoutes({ prisma: db.prisma, audit, config }),
        ],
      },
    }),
    guards: auth.guards,
  });

  await db.prisma
    .$executeRaw`INSERT INTO generateuniquecode (UNIQUE_CODE_NAME, UNIQUE_CODE_NUMBER) VALUES ('SB', 0)`;
  await db.prisma
    .$executeRaw`INSERT INTO account_type (ACCOUNT_TYPE_ID, ACCOUNT_TYPE) VALUES (18, 'Till (9900-9999)')`;
  await db.prisma
    .$executeRaw`INSERT INTO chart_of_accounts (ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, CURRENT_BALANCE, PHARMACY_ID) VALUES (63, 'Sales Till', 18, 0, 1)`;
  await db.prisma
    .$executeRaw`INSERT INTO taxcategory (CATEGORY_CODE, CATEGORY_VALUE, ACTIVE_S) VALUES ('A', 16, 'Y')`;
  const [tax] =
    await db.select`SELECT TAXCATEGORY_ID AS id FROM taxcategory WHERE CATEGORY_CODE = 'A'`;
  await db.prisma
    .$executeRaw`INSERT INTO items (ITEM_NM, ITEM_CD, ACTIVE_S) VALUES ('Testamol 500mg', 'TST500', 'Y')`;
  const [item] = await db.select`SELECT ITEM_ID AS id FROM items WHERE ITEM_CD = 'TST500'`;
  await db.prisma.$executeRaw`
    INSERT INTO stock (ITEM_ID, PHARMACY_ID, QUANTITY, BATCH_NO, EXPIRY_DT, UNIT_SALE_RATE, MRP, TAX_CATEGORY_ID, UNIT_PURCHASE_RATE, PURCHASE_DISCOUNT_PERCENTAGE)
    VALUES (${item.id}, 1, 100, 'APPROVE-ME', '2030-12-31', 116, 116, ${tax.id}, 50, 0)`;
  const [batch] = await db.select`SELECT STOCK_ID AS id FROM stock WHERE BATCH_NO = 'APPROVE-ME'`;
  ids.batch = Number(batch.id);

  // The admin approves (Sales approval, a plain-text legacy PIN). A second made-up person has a
  // PIN but may not approve.
  await db.prisma
    .$executeRaw`UPDATE employee_credentials SET APPROVAL_ACCESS_PIN = ${ADMIN_PIN} WHERE EMPLOYEE_ID = 1`;
  await db.prisma.$executeRaw`
    INSERT INTO employee_access (EMPLOYEE_ID, PHARMA_ACCESS_ID, ACTIVE_S, CREATION_USER_ID) VALUES (1, 900003, 'Y', 'test')`;
  await db.prisma.$executeRaw`
    INSERT INTO employee (EMPLOYEE_ID, FIRST_NM, LAST_NM, EMAIL_ID, PHARMACY_ID, ACTIVE_S, EMPLOYEE_CD, CREATION_USER_ID)
    VALUES (4, 'Olive', 'Other', 'other@example.test', 1, 'Y', 'EMP-T004', 'test')`;
  await db.prisma.$executeRaw`
    INSERT INTO employee_credentials (EMPLOYEE_ID, USER_NM, CURRENT_PASSWORD, ACTIVE_S, PASSWORD_STATUS, APPROVAL_ACCESS_PIN, TWO_FACTOR_ENABLED_S, CREATION_USER_ID)
    VALUES (4, 'test.other', 'Test-Other-Pass-1', 'Y', 1, ${OTHER_PIN}, 'N', 'test')`;
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

/** @type {Awaited<ReturnType<typeof signIn>>} */
let cashier;
beforeAll(async () => {
  cashier = await signIn('test.cashier', 'Test-Cashier-Pass-1');
});

/**
 * @param {string} path
 * @param {Record<string, unknown>} body
 */
const post = (path, body) => cashier.agent.post(path).set('x-csrf-token', cashier.csrf).send(body);
const BIG_DISCOUNT = () => [{ stockId: ids.batch, quantity: 2, discountPercent: 30 }];
/**
 * @param {Record<string, unknown>[]} lines
 * @param {string} [approvalToken]
 */
const sell = (lines, approvalToken) =>
  post(BILLS, {
    requestKey: randomUUID(),
    lines,
    payments: [{ method: 'cash', amount: '500' }],
    ...(approvalToken ? { approvalToken } : {}),
  });

describe('approvals at the till', () => {
  it('marks what needs approval on the quote, without showing costs', async () => {
    const response = await post('/api/v1/sales/quote', {
      lines: [
        { stockId: ids.batch, quantity: 1, discountPercent: 30 },
        { stockId: ids.batch, quantity: 1, labelPrice: '100' },
        { stockId: ids.batch, quantity: 1, labelPrice: '50' },
        { stockId: ids.batch, quantity: 1, discountPercent: 10 },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body.data.lines.map((/** @type {any} */ line) => line.needsApproval)).toEqual([
      ['discountAboveLimit'],
      ['priceChanged'],
      ['priceChanged', 'belowCost'],
      [],
    ]);
    expect(response.body.data.lines[1]).toMatchObject({
      labelPrice: '100.00',
      batchLabelPrice: '116.00',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/unitCost|profit/);
  });

  it('refuses such a sale without an approval', async () => {
    const response = await sell(BIG_DISCOUNT());
    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('body.approvalToken');
  });

  it('refuses the cashier as approver, someone without "Sales approval", and nothing to approve', async () => {
    const own = await post(APPROVALS, {
      lines: BIG_DISCOUNT(),
      reason: 'Regular customer',
      approver: 'test.cashier',
      pin: '0000',
    });
    expect(own.body.error.details).toEqual([
      { path: 'body.approver', message: "You can't approve your own sale. Ask someone else." },
    ]);
    const notAllowed = await post(APPROVALS, {
      lines: BIG_DISCOUNT(),
      reason: 'Regular customer',
      approver: 'test.other',
      pin: OTHER_PIN,
    });
    expect(notAllowed.body.error.details[0].message).toBe('This person may not approve sales');
    const nothing = await post(APPROVALS, {
      lines: [{ stockId: ids.batch, quantity: 1 }],
      reason: 'Regular customer',
      approver: 'test.admin',
      pin: ADMIN_PIN,
    });
    expect(nothing.body.error.details[0].message).toBe('Nothing on this sale needs approval');
  });

  it('approves with the PIN, keeps a hashed copy of it, and the approval sells those lines once', async () => {
    const approval = await post(APPROVALS, {
      lines: BIG_DISCOUNT(),
      reason: 'Regular customer',
      approver: 'test.admin',
      pin: ADMIN_PIN,
    });
    expect(approval.status).toBe(201);
    expect(approval.body.data).toMatchObject({
      approvedBy: 'Ada Admin',
      givenAway: '69.60',
      items: [{ stockId: ids.batch, reasons: ['discountAboveLimit'], givenAway: '69.60' }],
    });
    const [pin] =
      await db.select`SELECT PIN_HASH AS hash, LEGACY_FINGERPRINT AS fingerprint FROM ih_approval_pin WHERE EMPLOYEE_ID = 1`;
    expect(pin.hash).toMatch(/^\$argon2id\$/);
    expect(pin.fingerprint).toHaveLength(64);
    const [legacy] =
      await db.select`SELECT APPROVAL_ACCESS_PIN AS pin FROM employee_credentials WHERE EMPLOYEE_ID = 1`;
    expect(legacy.pin).toBe(ADMIN_PIN);

    // Changed lines no longer fit the approval.
    const changed = await sell(
      [{ stockId: ids.batch, quantity: 3, discountPercent: 30 }],
      approval.body.data.token,
    );
    expect(changed.status).toBe(400);

    const sold = await sell(BIG_DISCOUNT(), approval.body.data.token);
    expect(sold.status).toBe(201);
    expect(sold.body.data.approvals).toEqual([
      expect.objectContaining({
        kind: 'sale',
        requestedBy: 'Carl Cashier',
        approvedBy: 'Ada Admin',
        reason: 'Regular customer',
        givenAway: '69.60',
      }),
    ]);
    const again = await sell(BIG_DISCOUNT(), approval.body.data.token);
    expect(again.status).toBe(400);

    // The hashed copy works the next time.
    const next = await post(APPROVALS, {
      lines: BIG_DISCOUNT(),
      reason: 'Regular customer',
      approver: 'test.admin',
      pin: ADMIN_PIN,
    });
    expect(next.status).toBe(201);
  });

  it('locks the PIN after 3 wrong tries', async () => {
    await db.prisma.$executeRaw`
      INSERT INTO employee_access (EMPLOYEE_ID, PHARMA_ACCESS_ID, ACTIVE_S, CREATION_USER_ID) VALUES (4, 900003, 'Y', 'test')`;
    const wrong = () =>
      post(APPROVALS, {
        lines: BIG_DISCOUNT(),
        reason: 'Price match',
        approver: 'test.other',
        pin: '9999',
      });
    const messages = [];
    for (let attempt = 0; attempt < 3; attempt += 1)
      messages.push((await wrong()).body.error.details[0].message);
    expect(messages).toEqual([
      'Wrong PIN. 2 tries left before it is locked for 15 minutes.',
      'Wrong PIN. 1 try left before it is locked for 15 minutes.',
      'Wrong PIN. It is now locked for 15 minutes.',
    ]);
    const right = await post(APPROVALS, {
      lines: BIG_DISCOUNT(),
      reason: 'Price match',
      approver: 'test.other',
      pin: OTHER_PIN,
    });
    expect(right.body.error.details[0].message).toMatch(
      /^Too many wrong PINs\. Try again in \d+ minutes\.$/,
    );
  });

  it('lists the day’s approvals for approvers only', async () => {
    expect((await cashier.agent.get(APPROVALS)).status).toBe(403);
    const admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    const report = await admin.agent.get(APPROVALS);
    expect(report.status).toBe(200);
    expect(report.body.data.length).toBeGreaterThanOrEqual(1);
    expect(report.body.data[0]).toMatchObject({ kind: 'sale', approvedBy: 'Ada Admin' });
  });
});

describe('cancelling a bill', () => {
  /** @returns {Promise<number>} A new bill of 1 unit, paid in cash. */
  const newBill = async () => (await sell([{ stockId: ids.batch, quantity: 1 }])).body.data.id;
  /** @returns {Promise<number>} */
  const stock = async () =>
    Number((await db.select`SELECT QUANTITY AS q FROM stock WHERE STOCK_ID = ${ids.batch}`)[0].q);
  /**
   * @param {number} id
   * @param {Record<string, unknown>} body
   */
  const cancel = (id, body) => post(`${BILLS}/${id}/cancel`, body);

  it('lets the cashier cancel their own bill alone, soon after; stock and till go back', async () => {
    const id = await newBill();
    const before = await stock();
    const response = await cancel(id, { reason: 'Wrong item' });
    expect(response.status).toBe(204);
    expect(await stock()).toBe(before + 1);
    const [bill] =
      await db.select`SELECT PAYMENT_STATUS AS status FROM sales WHERE BILL_ID = ${id}`;
    expect(bill.status).toBe('Cancel');
    const [till] =
      await db.select`SELECT AMOUNT AS amount FROM till_balance WHERE BILL_ID = ${id} ORDER BY TILL_BALANCE_ID DESC LIMIT 1`;
    expect(Number(till.amount)).toBe(-116);
    expect((await cancel(id, { reason: 'Again' })).status).toBe(409);
    const detail = await cashier.agent.get(`${BILLS}/${id}`);
    expect(detail.body.data.approvals).toEqual([
      expect.objectContaining({
        kind: 'cancel',
        requestedBy: 'Carl Cashier',
        approvedBy: null,
        reason: 'Wrong item',
      }),
    ]);
  });

  it('needs a second person later on, and refuses bills of an earlier day', async () => {
    const id = await newBill();
    await db.prisma
      .$executeRaw`UPDATE sales SET CREATION_TS = NOW() - INTERVAL 20 MINUTE WHERE BILL_ID = ${id}`;
    const alone = await cancel(id, { reason: 'Customer changed mind' });
    expect(alone.status).toBe(400);
    expect(alone.body.error.details.map((/** @type {any} */ d) => d.path)).toEqual([
      'body.approver',
      'body.pin',
    ]);
    const approved = await cancel(id, {
      reason: 'Customer changed mind',
      approver: 'test.admin',
      pin: ADMIN_PIN,
    });
    expect(approved.status).toBe(204);

    const old = await newBill();
    await db.prisma
      .$executeRaw`UPDATE sales SET BILL_DATE = DATE_SUB(BILL_DATE, INTERVAL 1 DAY) WHERE BILL_ID = ${old}`;
    const refused = await cancel(old, { reason: 'Too late' });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toBe(
      "Bills from an earlier day can't be cancelled. Make a return instead.",
    );
  });
});
