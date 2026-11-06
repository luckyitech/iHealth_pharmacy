import { randomUUID } from 'node:crypto';

import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createSalesBillRoutes } from '../../src/features/sales/bills.routes.js';
import { createCreditNoteRoutes } from '../../src/features/sales/credit-notes.routes.js';
import { createReturnRoutes } from '../../src/features/sales/returns.routes.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

const API = '/api/v1/sales';
const ADMIN_PIN = '4321';
/** "Sales Return Approval", the legacy permission. */
const RETURN_APPROVAL = 8;
const CREDIT_NOTE_MONTHS = 12;

/** @type {Awaited<ReturnType<typeof startTestDatabase>>} */
let db;
/** @type {import('express').Express} */
let app;
/** @type {Record<string, number>} */
const ids = {};
/** The credit note the full return gives, spent in the next part. */
let noteCode = '';
let noteAmount = '';

beforeAll(async () => {
  db = await startTestDatabase();
  const config = loadConfig({
    ...TEST_ENV,
    DATABASE_URL: db.url,
    CREDIT_NOTE_VALID_MONTHS: String(CREDIT_NOTE_MONTHS),
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
  const deps = { prisma: db.prisma, audit, config };
  app = buildTestApp({
    prisma: db.prisma,
    redis: db.redis,
    routes: collectRoutes({
      auth,
      sales: {
        routes: [
          ...createSalesBillRoutes(deps),
          ...createReturnRoutes(deps),
          ...createCreditNoteRoutes(deps),
        ],
      },
    }),
    guards: auth.guards,
  });

  await db.prisma.$executeRaw`
    INSERT INTO generateuniquecode (UNIQUE_CODE_NAME, UNIQUE_CODE_NUMBER) VALUES ('SB', 0), ('SR', 0), ('CN', 0)`;
  await db.prisma
    .$executeRaw`INSERT INTO account_type (ACCOUNT_TYPE_ID, ACCOUNT_TYPE) VALUES (18, 'Till (9900-9999)')`;
  // The legacy payment types, with the ids the legacy credit-note trigger expects (cash is 1).
  await db.prisma.$executeRaw`
    INSERT INTO payment_types (PAYMENT_TYPE_ID, TYPE) VALUES (1, 'CASH'), (2, 'CREDIT'), (3, 'M-PESA')`;
  await db.prisma
    .$executeRaw`INSERT INTO chart_of_accounts (ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, CURRENT_BALANCE, PHARMACY_ID) VALUES (63, 'Sales Till', 18, 0, 1)`;
  await db.prisma.$executeRaw`
    INSERT INTO customer (FIRST_NM, LAST_NM, PHONE_NBR, ACTIVE_S) VALUES ('Jane', 'Testcase', '0700000104', 'Y')`;
  const [customer] = await db.select`SELECT CUSTOMER_ID AS id FROM customer`;
  ids.customer = customer.id;

  // Made-up stock: one item in two batches, sold from both on one bill, and a second item.
  await db.prisma.$executeRaw`
    INSERT INTO items (ITEM_NM, ITEM_CD, ACTIVE_S) VALUES ('Testamol 500mg', 'TST500', 'Y'), ('Samplocillin 250mg', 'SMP250', 'Y')`;
  for (const row of await db.select`SELECT ITEM_ID AS id, ITEM_CD AS code FROM items`)
    ids[row.code] = row.id;
  await db.prisma.$executeRaw`
    INSERT INTO stock (ITEM_ID, PHARMACY_ID, QUANTITY, BATCH_NO, EXPIRY_DT, UNIT_SALE_RATE, UNIT_PURCHASE_RATE)
    VALUES (${ids.TST500}, 1, 10, 'TM-OLDER', '2030-01-31', 116, 80),
           (${ids.TST500}, 1, 10, 'TM-NEWER', '2031-01-31', 116, 80),
           (${ids.SMP250}, 1, 10, 'SMP-1', '2030-12-31', 20.25, 15)`;
  for (const row of await db.select`SELECT STOCK_ID AS id, BATCH_NO AS batch FROM stock`)
    ids[row.batch] = row.id;

  // The admin approves returns; the cashier holds the permission too but may not approve their own.
  await db.prisma
    .$executeRaw`UPDATE employee_credentials SET APPROVAL_ACCESS_PIN = ${ADMIN_PIN} WHERE EMPLOYEE_ID = 1`;
  await db.prisma.$executeRaw`
    INSERT INTO employee_access (EMPLOYEE_ID, PHARMA_ACCESS_ID, ACTIVE_S, CREATION_USER_ID) VALUES (1, ${RETURN_APPROVAL}, 'Y', 'test')`;
});

afterAll(async () => {
  await db?.stop();
});

/**
 * @param {number} stockId
 * @returns {Promise<number>}
 */
const quantityOf = async (stockId) =>
  Number((await db.select`SELECT QUANTITY AS q FROM stock WHERE STOCK_ID = ${stockId}`)[0].q);
const till = async () =>
  Number(
    (await db.select`SELECT CURRENT_BALANCE AS b FROM chart_of_accounts WHERE ACCOUNT_ID = 63`)[0]
      .b,
  );

describe('sales returns', () => {
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
      .post(`${API}/bills`)
      .set('x-csrf-token', cashier.csrf)
      .send({
        requestKey: randomUUID(),
        customerId: ids.customer,
        lines: [
          { stockId: ids['TM-OLDER'], quantity: 3 },
          { stockId: ids['TM-NEWER'], quantity: 2 },
          { stockId: ids['SMP-1'], quantity: 4, discountPercent: 10 },
        ],
        payments: [{ method: 'cash', amount: '1000' }],
      });
    expect(sale.status).toBe(201);
    bill = sale.body.data;
  });

  /**
   * @param {Record<string, unknown>} body
   * @returns {import('supertest').Test}
   */
  const giveBack = (body) =>
    cashier.agent
      .post(`${API}/bills/${bill.id}/returns`)
      .set('x-csrf-token', cashier.csrf)
      .send({ reason: 'Treatment changed', approver: 'test.admin', pin: ADMIN_PIN, ...body });

  it('lists what each line can still return and what a unit gives back', async () => {
    const response = await cashier.agent.get(`${API}/bills/${bill.id}/returnable`);
    expect(response.body.data).toMatchObject({ billId: bill.id, blocked: null, returnDays: 30 });
    expect(
      response.body.data.lines.map((/** @type {any} */ l) => [l.sold, l.returnable, l.unitRefund]),
    ).toEqual([
      [3, 3, '116.00'],
      [2, 2, '116.00'],
      [4, 4, '18.23'],
    ]);
  });

  it('refuses the cashier as approver and more than was sold', async () => {
    const own = await giveBack({
      approver: 'test.cashier',
      lines: [{ lineId: bill.lines[0].id, quantity: 1, condition: 'restock' }],
      refund: 'cash',
    });
    expect(own.status).toBe(400);
    expect(own.body.error.details[0].message).toMatch(/own return/);
    const tooMany = await giveBack({
      lines: [{ lineId: bill.lines[0].id, quantity: 4, condition: 'restock' }],
      refund: 'cash',
    });
    expect(tooMany.body.error.details).toEqual([
      { path: 'body.lines.0.quantity', message: 'Only 3 left to return' },
    ]);
  });

  it('puts good units back in the batch they were sold from, writes off the rest, and pays cash from the till', async () => {
    const before = {
      older: await quantityOf(ids['TM-OLDER']),
      newer: await quantityOf(ids['TM-NEWER']),
      smp: await quantityOf(ids['SMP-1']),
      till: await till(),
    };
    const response = await giveBack({
      lines: [
        { lineId: bill.lines[0].id, quantity: 2, condition: 'restock' },
        { lineId: bill.lines[2].id, quantity: 1, condition: 'writeOff' },
      ],
      refund: 'cash',
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      refund: '250.23',
      refundMethod: 'cash',
      approvedBy: 'Ada Admin',
      creditNote: null,
    });
    expect(response.body.data.code).toMatch(/^DPSR\d{6}0001$/);
    expect(await quantityOf(ids['TM-OLDER'])).toBe(before.older + 2);
    expect(await quantityOf(ids['TM-NEWER'])).toBe(before.newer);
    expect(await quantityOf(ids['SMP-1'])).toBe(before.smp);
    expect(await till()).toBeCloseTo(before.till - 250.23, 2);

    // The legacy tables see it; the bill itself is untouched.
    const [legacy] = await db.select`
      SELECT r.STATUS AS status, r.TOTAL_AMOUNT AS total, c.bill_type_id AS billType, s.PAYMENT_STATUS AS bill
      FROM sales_return r JOIN credit_note c ON c.SOURCE_REF = r.SALES_RETURN_NO JOIN sales s ON s.BILL_ID = r.BILL_ID
      WHERE r.BILL_ID = ${bill.id}`;
    expect(legacy).toMatchObject({ status: 'Approved', billType: 'Cash Back', bill: 'Paid' });
    expect(Number(legacy.total)).toBeCloseTo(250.23, 2);
    const kinds = await db.select`
      SELECT ENTRY_TYPE AS type, COUNT(*) AS n FROM stock_history
      WHERE ENTRY_TYPE IN ('Sales Return', 'Return Write-off') GROUP BY ENTRY_TYPE ORDER BY ENTRY_TYPE`;
    expect(kinds.map((/** @type {any} */ row) => row.type)).toEqual([
      'Return Write-off',
      'Sales Return',
    ]);
    const [approval] =
      await db.select`SELECT KIND AS kind FROM ih_sale_approval WHERE BILL_ID = ${bill.id}`;
    expect(approval.kind).toBe('return');
  });

  it('gives back exactly what is left of the bill as a credit note when everything else comes back', async () => {
    const returnable = (await cashier.agent.get(`${API}/bills/${bill.id}/returnable`)).body.data;
    expect(returnable.lines.map((/** @type {any} */ l) => l.returnable)).toEqual([1, 2, 3]);
    const response = await giveBack({
      lines: returnable.lines.map((/** @type {any} */ l) => ({
        lineId: l.lineId,
        quantity: l.returnable,
        condition: 'restock',
      })),
      refund: 'creditNote',
    });
    expect(response.status).toBe(201);
    const expected = (Number(bill.totals.net) - 250.23).toFixed(2);
    expect(response.body.data.refund).toBe(expected);
    expect(response.body.data.creditNote).toMatchObject({
      amount: expected,
      balance: expected,
      customerName: 'Jane Testcase',
      originalBillCode: bill.code,
    });
    expect(response.body.data.creditNote.code).toMatch(/^DPCN\d{6}0002$/);
    expect(response.body.data.creditNote.expiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    ids.note = response.body.data.creditNote.id;
    noteCode = response.body.data.creditNote.code;
    noteAmount = expected;

    const after = (await cashier.agent.get(`${API}/bills/${bill.id}/returnable`)).body.data;
    expect(after.lines.every((/** @type {any} */ l) => l.returnable === 0)).toBe(true);
    const receipt = await cashier.agent
      .get(`${API}/returns/${response.body.data.id}/receipt`)
      .buffer(true);
    expect(receipt.headers['content-type']).toBe('application/pdf');
    await cashier.agent.get(`${API}/returns/${response.body.data.id}/receipt`).buffer(true);

    // The bill's history shows each return, who approved it, and each paper printed.
    const history = (await cashier.agent.get(`${API}/bills/${bill.id}/history`)).body.data;
    const returned = history.filter((/** @type {any} */ e) => e.action === 'return.made');
    expect(returned).toHaveLength(2);
    expect(returned[1].details).toMatchObject({ method: 'creditNote', creditNote: noteCode });
    expect(returned[1].details.approvedBy).toBeTruthy();
    expect(
      history
        .filter((/** @type {any} */ e) => e.action.startsWith('return-receipt.'))
        .map((/** @type {any} */ e) => e.action),
    ).toEqual(['return-receipt.printed', 'return-receipt.reprinted']);
  });

  it('refuses a cancelled bill and a bill older than the return limit', async () => {
    const [old] = await db.select`SELECT BILL_ID AS id FROM sales WHERE BILL_ID = ${bill.id}`;
    void old;
    await db.prisma.$executeRaw`
      INSERT INTO sales (BILL_CODE, BILL_DATE, PAYMENT_STATUS, NET_AMOUNT, PHARMACY_ID, EMPLOYEE_ID, ACTIVE_S)
      VALUES ('OLD-1', '2020-01-15', 'Paid', 100, 1, 2, 'Y'), ('CAN-1', CURDATE(), 'Cancel', 100, 1, 2, 'Y')`;
    for (const code of ['OLD-1', 'CAN-1']) {
      const [row] = await db.select`SELECT BILL_ID AS id FROM sales WHERE BILL_CODE = ${code}`;
      const response = await cashier.agent.get(`${API}/bills/${row.id}/returnable`);
      expect(response.body.data.blocked).toMatch(code === 'OLD-1' ? /days old/ : /cancelled/);
    }
  });
});

describe('paying with a credit note', () => {
  /** @type {{ agent: import('supertest').Agent, csrf: string }} */
  let cashier;

  beforeAll(async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'test.cashier', password: 'Test-Cashier-Pass-1' });
    cashier = { agent, csrf: login.body.data.csrfToken };
  });

  /**
   * @param {Record<string, unknown>[]} payments
   * @param {number} [quantity]
   * @returns {import('supertest').Test}
   */
  const sell = (payments, quantity = 2) =>
    cashier.agent
      .post(`${API}/bills`)
      .set('x-csrf-token', cashier.csrf)
      .send({
        requestKey: randomUUID(),
        lines: [{ stockId: ids['TM-NEWER'], quantity }],
        payments,
      });
  /** @param {string} code */
  const lookUp = async (code) => (await cashier.agent.get(`${API}/credit-notes/${code}`)).body.data;

  it('pays part of a bill and keeps what is left on the same note', async () => {
    expect(await lookUp(noteCode.toLowerCase())).toMatchObject({
      code: noteCode,
      balance: noteAmount,
      customerName: 'Jane Testcase',
      problem: null,
    });
    // 2 x 116 = 232: the note pays 100, cash the rest.
    const sale = await sell([
      { method: 'creditNote', reference: noteCode, amount: '100' },
      { method: 'cash', amount: '200' },
    ]);
    expect(sale.status).toBe(201);
    expect(sale.body.data.payments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'creditNote', amount: '100.00', reference: noteCode }),
      ]),
    );
    const left = (Number(noteAmount) - 100).toFixed(2);
    expect((await lookUp(noteCode)).balance).toBe(left);

    const tooMuch = await sell(
      [
        { method: 'creditNote', reference: noteCode, amount: String(Number(left) + 1) },
        { method: 'cash', amount: '500' },
      ],
      5,
    );
    expect(tooMuch.body.error.details).toEqual([
      { path: 'body.payments.0.amount', message: `Only ${left} is left on this credit note` },
    ]);
  });

  it('closes a note once it is used up', async () => {
    const left = (await lookUp(noteCode)).balance;
    const sale = await sell(
      [
        { method: 'creditNote', reference: noteCode, amount: left },
        { method: 'cash', amount: '5000' },
      ],
      3,
    );
    expect(sale.status).toBe(201);
    expect(await lookUp(noteCode)).toMatchObject({
      balance: '0.00',
      problem: 'This credit note has been used up',
    });
    const [legacy] =
      await db.select`SELECT PAYMENT_STATUS AS status FROM credit_note WHERE credit_note_id = ${ids.note}`;
    expect(legacy.status).toBe('Paid');
    const again = await sell([
      { method: 'creditNote', reference: noteCode, amount: '1' },
      { method: 'cash', amount: '500' },
    ]);
    expect(again.body.error.details[0]).toMatchObject({ path: 'body.payments.0.reference' });
  });

  it('takes an open note from the legacy app at its whole amount, and refuses expired and supplier notes', async () => {
    await db.prisma.$executeRaw`
      INSERT INTO credit_note (credit_note_no, credit_date, amount, return_type, STATUS, PAYMENT_STATUS, ACTIVE_S, PHARMACY_ID)
      VALUES ('DPCN0101250001', '2025-01-01', 150, 'Sales Returns', 'Approved', 'Pending', 'Y', 1),
             ('DPCN0101250002', '2025-01-01', 150, 'Sales Returns', 'Approved', 'Pending', 'Y', 1),
             ('DPCN0101250003', '2025-01-01', 150, 'Purchase', 'Approved', 'Pending', 'Y', 1)`;
    expect(await lookUp('DPCN0101250001')).toMatchObject({
      balance: '150.00',
      expiresOn: null,
      problem: null,
    });
    const [expiring] =
      await db.select`SELECT credit_note_id AS id FROM credit_note WHERE credit_note_no = 'DPCN0101250002'`;
    await db.prisma.$executeRaw`
      INSERT INTO ih_credit_note (CREDIT_NOTE_ID, BALANCE, EXPIRES_ON) VALUES (${expiring.id}, 150, '2025-06-30')`;
    expect((await lookUp('DPCN0101250002')).problem).toMatch(/expired/);
    expect((await lookUp('DPCN0101250003')).problem).toMatch(/supplier/);
    const missing = await cashier.agent.get(`${API}/credit-notes/NOPE`);
    expect(missing.status).toBe(404);

    const sale = await sell([
      { method: 'creditNote', reference: 'DPCN0101250001', amount: '150' },
      { method: 'cash', amount: '100' },
    ]);
    expect(sale.status).toBe(201);
    expect((await lookUp('DPCN0101250001')).balance).toBe('0.00');
  });
});

describe('the Returns page', () => {
  /** @type {{ agent: import('supertest').Agent, csrf: string }} */
  let cashier;

  beforeAll(async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'test.cashier', password: 'Test-Cashier-Pass-1' });
    cashier = { agent, csrf: login.body.data.csrfToken };
  });

  it("lists the day's returns, the legacy app's included", async () => {
    const [today] =
      await db.select`SELECT CAST(MAX(SALES_RETURN_DATE) AS CHAR) AS day FROM sales_return`;
    const [bill] = await db.select`SELECT BILL_ID AS id FROM sales WHERE BILL_CODE = 'OLD-1'`;
    await db.prisma.$executeRaw`
      INSERT INTO sales_return (SALES_RETURN_NO, SALES_RETURN_DATE, STATUS, BILL_ID, TOTAL_AMOUNT, PAYMENT_TYPE_ID, PHARMACY_ID, REMARKS, ACTIVE_S)
      VALUES ('LEGACY-SR-1', ${today.day}, 'Approved', ${bill.id}, 50, 3, 1, 'Wrong medicine', 'Y')`;
    const list = async (/** @type {Record<string, string | number>} */ query = {}) =>
      (
        await cashier.agent
          .get(`${API}/returns`)
          .query({ from: today.day, to: today.day, ...query })
      ).body;
    const all = await list({ sort: 'code' });
    expect(all.meta.total).toBe(3);
    const byCode = Object.fromEntries(all.data.map((/** @type {any} */ r) => [r.code, r]));
    expect(all.data.map((/** @type {any} */ r) => [r.refundMethod, r.hasReceipt]).sort()).toEqual([
      ['cash', true],
      ['creditNote', true],
      ['mpesa', false],
    ]);
    expect(byCode['LEGACY-SR-1']).toMatchObject({ approvedBy: null, reason: 'Wrong medicine' });
    const cash = all.data.find((/** @type {any} */ r) => r.refundMethod === 'cash');
    expect(cash).toMatchObject({
      approvedBy: 'Ada Admin',
      requestedBy: 'Carl Cashier',
      lineCount: 2,
    });

    // Searched and filtered like Sales history.
    expect(
      (await list({ refundMethod: 'mpesa' })).data.map((/** @type {any} */ r) => r.code),
    ).toEqual(['LEGACY-SR-1']);
    expect((await list({ q: 'legacy-sr' })).meta.total).toBe(1);
    expect((await list({ q: 'jane' })).meta.total).toBe(2);
    expect((await list({ approverId: 1 })).meta.total).toBe(2);
    const approvers = (await cashier.agent.get(`${API}/returns/approvers`)).body.data;
    expect(approvers).toEqual([{ id: 1, name: 'Ada Admin' }]);
  });

  it('lists credit notes with where each stands, and each time one was used', async () => {
    const list = async (/** @type {Record<string, string>} */ query = {}) =>
      (await cashier.agent.get(`${API}/credit-notes`).query(query)).body;
    const all = await list();
    const states = Object.fromEntries(all.data.map((/** @type {any} */ n) => [n.code, n.state]));
    expect(states).toMatchObject({
      [noteCode]: 'usedUp',
      DPCN0101250001: 'usedUp',
      DPCN0101250002: 'expired',
    });
    // Supplier notes are not shown.
    expect(states.DPCN0101250003).toBeUndefined();
    expect((await list({ state: 'expired' })).data.map((/** @type {any} */ n) => n.code)).toEqual([
      'DPCN0101250002',
    ]);
    expect((await list({ q: 'jane' })).data.map((/** @type {any} */ n) => n.code)).toContain(
      noteCode,
    );

    const uses = (await cashier.agent.get(`${API}/credit-notes/${noteCode}/uses`)).body.data;
    expect(uses.map((/** @type {any} */ u) => [u.amount, u.balanceAfter])).toEqual([
      ['100.00', (Number(noteAmount) - 100).toFixed(2)],
      [(Number(noteAmount) - 100).toFixed(2), '0.00'],
    ]);
    expect(uses[0].usedBy).toBe('Carl Cashier');
    const note = all.data.find((/** @type {any} */ n) => n.code === noteCode);
    expect(note.issuedBy).toBe('Carl Cashier');
    expect(note.approvedBy).toBeTruthy();
  });
});
