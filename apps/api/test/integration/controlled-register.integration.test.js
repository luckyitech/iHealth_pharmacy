import { randomUUID } from 'node:crypto';

import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { todayIn } from '../../src/features/sales/batches.repository.js';
import { createSalesBillRoutes } from '../../src/features/sales/bills.routes.js';
import { createControlledRegisterRoutes } from '../../src/features/sales/controlled-register.routes.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

const REGISTER = '/api/v1/sales/controlled-register';
const REGISTER_PERMISSION = 900004;
const MS_PER_DAY = 86_400_000;

/** @type {Awaited<ReturnType<typeof startTestDatabase>>} */
let db;
/** @type {import('express').Express} */
let app;
/** @type {Record<string, number>} */
const ids = {};
/** A period around today, wide enough for any clock difference between the API and the database. */
const period = { from: '', to: '' };

beforeAll(async () => {
  db = await startTestDatabase();
  await db.prisma.$executeRaw`
    INSERT INTO provider (FIRST_NM, LAST_NM, ACTIVE_S) VALUES ('Amani', 'Demo', 'Y'), ('N/A', NULL, 'Y')`;
  for (const row of await db.select`SELECT PROVIDER_ID AS id, FIRST_NM AS name FROM provider`)
    ids[row.name] = row.id;
  const config = loadConfig({
    ...TEST_ENV,
    DATABASE_URL: db.url,
    SALES_DEFAULT_PROVIDER_ID: String(ids['N/A']),
  });
  const today = todayIn(config.region.timeZone);
  period.from = new Date(Date.parse(today) - MS_PER_DAY).toISOString().slice(0, 10);
  period.to = new Date(Date.parse(today) + MS_PER_DAY).toISOString().slice(0, 10);
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
        routes: [...createSalesBillRoutes(deps), ...createControlledRegisterRoutes(deps)],
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
  await db.prisma.$executeRaw`
    INSERT INTO schedule_category_code (SCHEDULE_CATEGORY_CODE, ACTIVE_S) VALUES ('X', 'Y')`;
  const [code] =
    await db.select`SELECT SCHEDULE_CATEGORY_CODE_ID AS id FROM schedule_category_code`;
  await db.prisma.$executeRaw`
    INSERT INTO items (ITEM_NM, ITEM_CD, SCHEDULE_CATEGORY_CODE_ID, ACTIVE_S)
    VALUES ('Calmadol 50mg tabs', 'CAL50', ${code.id}, 'Y'), ('Testamol 500mg', 'TST500', NULL, 'Y')`;
  for (const row of await db.select`SELECT ITEM_ID AS id, ITEM_CD AS code FROM items`)
    ids[row.code] = row.id;

  // A batch arrives, and more of it is received on an invoice: the legacy triggers write the history.
  await db.prisma.$executeRaw`
    INSERT INTO stock (ITEM_ID, PHARMACY_ID, QUANTITY, BATCH_NO, EXPIRY_DT, UNIT_SALE_RATE, UNIT_PURCHASE_RATE)
    VALUES (${ids.CAL50}, 1, 20, 'CL-1', '2030-12-31', 42, 20)`;
  const [batch] = await db.select`SELECT STOCK_ID AS id FROM stock WHERE BATCH_NO = 'CL-1'`;
  ids['CL-1'] = batch.id;
  await db.prisma.$executeRaw`
    UPDATE stock SET QUANTITY = QUANTITY + 100, ENTRY_TYPE = 'Invoice Addition', INVOICE_NO = 'INV-TEST-1'
    WHERE STOCK_ID = ${batch.id}`;

  // The cashier may sell; reading the register is a separate permission.
  await db.prisma.$executeRaw`
    INSERT INTO employee_access (EMPLOYEE_ID, PHARMA_ACCESS_ID, ACTIVE_S, CREATION_USER_ID)
    VALUES (2, ${REGISTER_PERMISSION}, 'Y', 'test')`;
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

describe('the controlled-drug register', () => {
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let pharmacist;
  /** @type {number} */
  let billId;

  beforeAll(async () => {
    pharmacist = await signIn('test.cashier', 'Test-Cashier-Pass-1');
    const sale = await pharmacist.agent
      .post('/api/v1/sales/bills')
      .set('x-csrf-token', pharmacist.csrf)
      .send({
        requestKey: randomUUID(),
        customerName: 'Jane Testcase',
        customerPhone: '0700000104',
        lines: [{ stockId: ids['CL-1'], quantity: 3 }],
        payments: [{ method: 'cash', amount: '200' }],
        prescription: {
          doctorId: ids.Amani,
          prescribedOn: '2026-11-01',
          patientIdNumber: 'TEST1234',
        },
      });
    expect(sale.status).toBe(201);
    billId = sale.body.data.id;
  });

  it('lists the controlled drugs with what is on hand', async () => {
    const response = await pharmacist.agent.get(`${REGISTER}/items`);
    expect(response.body.data).toEqual([
      { id: ids.CAL50, name: 'Calmadol 50mg tabs', code: 'CAL50', onHand: 117 },
    ]);
  });

  it('shows every movement with a running balance that ends at what is on hand', async () => {
    const response = await pharmacist.agent.get(REGISTER).query({ itemId: ids.CAL50, ...period });
    expect(response.status).toBe(200);
    const register = response.body.data;
    expect(register).toMatchObject({ opening: 0, closing: 117 });
    expect(
      register.entries.map((/** @type {any} */ e) => [
        e.kind,
        e.quantityIn,
        e.quantityOut,
        e.balance,
      ]),
    ).toEqual([
      ['other', 20, 0, 20],
      ['received', 100, 0, 120],
      ['sold', 0, 3, 117],
    ]);
    expect(register.entries[0].entryType).toBe('New batch');
    expect(register.entries[1].invoiceNo).toBe('INV-TEST-1');
    expect(register.entries[2]).toMatchObject({
      billId,
      patientName: 'Jane Testcase',
      patientIdNumber: 'TEST1234',
      doctorName: 'Amani Demo',
      batchNo: 'CL-1',
      by: 'Carl Cashier',
    });
    const [seen] = await db.select`
      SELECT COUNT(*) AS n FROM ih_audit_log
      WHERE ACTION = 'sales/controlled-register.view' AND RESOURCE_ID = ${String(ids.CAL50)}`;
    expect(Number(seen.n)).toBe(1);
  });

  it('starts a later period from the balance at its start', async () => {
    const response = await pharmacist.agent
      .get(REGISTER)
      .query({ itemId: ids.CAL50, from: period.to, to: period.to });
    expect(response.body.data).toMatchObject({ opening: 117, closing: 117, entries: [] });
  });

  it('prints the register as a PDF, and records the print', async () => {
    const response = await pharmacist.agent
      .get(`${REGISTER}/pdf`)
      .query({ itemId: ids.CAL50, ...period })
      .buffer(true);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    const [printed] = await db.select`
      SELECT COUNT(*) AS n FROM ih_audit_log WHERE ACTION = 'sales/controlled-register.print'`;
    expect(Number(printed.n)).toBe(1);
  });

  it('refuses an item that is not controlled, a period too long, and people without the permission', async () => {
    const plain = await pharmacist.agent.get(REGISTER).query({ itemId: ids.TST500, ...period });
    expect(plain.status).toBe(404);
    const long = await pharmacist.agent
      .get(REGISTER)
      .query({ itemId: ids.CAL50, from: '2020-01-01', to: period.to });
    expect(long.status).toBe(400);
    const admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    const denied = await admin.agent.get(REGISTER).query({ itemId: ids.CAL50, ...period });
    expect(denied.status).toBe(403);
  });
});
