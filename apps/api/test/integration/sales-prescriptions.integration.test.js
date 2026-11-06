import { randomUUID } from 'node:crypto';

import { PERMISSIONS } from '@ihealth/shared/permissions';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createSalesBillRoutes } from '../../src/features/sales/bills.routes.js';
import { createMedicineTypeRoutes } from '../../src/features/masters/medicine-types.js';
import { createSalesSettingsRoutes } from '../../src/features/masters/sales-settings.routes.js';
import { createPrescriberRoutes } from '../../src/features/sales/prescribers.js';
import { createSaleQuoteRoutes } from '../../src/features/sales/quote.routes.js';
import { createTillRoutes } from '../../src/features/sales/till.routes.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

const API = '/api/v1/sales';
/** A one-pixel PNG, as a data URL. */
const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PHOTO_MAX_KB = 50;

/** @type {Awaited<ReturnType<typeof startTestDatabase>>} */
let db;
/** @type {import('express').Express} */
let app;
/** @type {Record<string, number>} */
const ids = {};

beforeAll(async () => {
  db = await startTestDatabase();
  // Made-up doctors and hospitals; one doctor stands for "no doctor", as in the legacy data.
  await db.prisma.$executeRaw`
    INSERT INTO hospital (NAME, ACTIVE_S) VALUES ('Sample Medical Centre', 'Y'), ('Closed Clinic', 'N')`;
  for (const row of await db.select`SELECT HOSPITAL_ID AS id, NAME AS name FROM hospital`)
    ids[row.name] = row.id;
  await db.prisma.$executeRaw`
    INSERT INTO provider (FIRST_NM, LAST_NM, LICENSE_NUMBER, HOSPITAL_ID, ACTIVE_S)
    VALUES ('N/A', NULL, NULL, NULL, 'Y'),
           ('Amani', 'Demo', 'TEST-0001', ${ids['Sample Medical Centre']}, 'Y'),
           ('Bora', 'Example', 'TEST-0002', NULL, 'Y'),
           ('Amara', 'Gone', 'TEST-0003', NULL, 'N')`;
  for (const row of await db.select`SELECT PROVIDER_ID AS id, FIRST_NM AS name FROM provider`)
    ids[row.name] = row.id;

  const config = loadConfig({
    ...TEST_ENV,
    DATABASE_URL: db.url,
    SALES_DEFAULT_PROVIDER_ID: String(ids['N/A']),
    PRESCRIPTION_PHOTO_MAX_KB: String(PHOTO_MAX_KB),
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
          ...createSaleQuoteRoutes(deps),
          ...createTillRoutes(deps),
          ...createPrescriberRoutes(deps),
        ],
      },
      masters: { routes: [...createMedicineTypeRoutes(deps), ...createSalesSettingsRoutes(deps)] },
    }),
    guards: auth.guards,
  });

  await db.prisma
    .$executeRaw`INSERT INTO generateuniquecode (UNIQUE_CODE_NAME, UNIQUE_CODE_NUMBER) VALUES ('SB', 0)`;
  await db.prisma
    .$executeRaw`INSERT INTO account_type (ACCOUNT_TYPE_ID, ACCOUNT_TYPE) VALUES (18, 'Till (9900-9999)')`;
  await db.prisma
    .$executeRaw`INSERT INTO chart_of_accounts (ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, CURRENT_BALANCE, PHARMACY_ID) VALUES (63, 'Sales Till', 18, 0, 1)`;

  // Made-up medicines of each kind, with the legacy schedule codes.
  await db.prisma.$executeRaw`
    INSERT INTO schedule_category_code (SCHEDULE_CATEGORY_CODE, SCHEDULE_CATEGORY_DESC, ACTIVE_S)
    VALUES ('H', 'Prescription', 'Y'), ('X', 'Narcotic', 'Y'), ('H1', 'Antibiotic', 'Y')`;
  for (const row of await db.select`SELECT SCHEDULE_CATEGORY_CODE_ID AS id, SCHEDULE_CATEGORY_CODE AS code FROM schedule_category_code`)
    ids[`schedule ${row.code}`] = row.id;
  await db.prisma.$executeRaw`
    INSERT INTO items (ITEM_NM, ITEM_CD, SCHEDULE_CATEGORY_CODE_ID, ACTIVE_S)
    VALUES ('Hypotest 10mg', 'HYP10', ${ids['schedule H']}, 'Y'),
           ('Calmadol 50mg', 'CAL50', ${ids['schedule X']}, 'Y'),
           ('Amoxidemo 250mg', 'AMX250', ${ids['schedule H1']}, 'Y'),
           ('Testamol 500mg', 'TST500', NULL, 'Y')`;
  const items = await db.select`SELECT ITEM_ID AS id, ITEM_CD AS code FROM items`;
  const item = Object.fromEntries(items.map((row) => [row.code, row.id]));
  await db.prisma.$executeRaw`
    INSERT INTO stock (ITEM_ID, PHARMACY_ID, QUANTITY, BATCH_NO, EXPIRY_DT, UNIT_SALE_RATE, UNIT_PURCHASE_RATE)
    VALUES (${item.HYP10}, 1, 50, 'HYP-1', '2030-12-31', 640, 400),
           (${item.CAL50}, 1, 50, 'CAL-1', '2030-12-31', 42, 20),
           (${item.AMX250}, 1, 50, 'AMX-1', '2030-12-31', 380, 200),
           (${item.TST500}, 1, 50, 'TST-1', '2030-12-31', 116, 80)`;
  for (const row of await db.select`SELECT STOCK_ID AS id, BATCH_NO AS batch FROM stock`)
    ids[row.batch] = row.id;
});

afterAll(async () => {
  await db?.stop();
});

describe('prescriptions at the till', () => {
  /** @type {{ agent: import('supertest').Agent, csrf: string }} */
  let cashier;

  beforeAll(async () => {
    const agent = request.agent(app);
    const response = await agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'test.cashier', password: 'Test-Cashier-Pass-1' });
    cashier = { agent, csrf: response.body.data.csrfToken };
  });

  /** @param {Record<string, unknown>} body */
  const sell = (body) =>
    cashier.agent
      .post(`${API}/bills`)
      .set('x-csrf-token', cashier.csrf)
      .send({ requestKey: randomUUID(), payments: [{ method: 'cash', amount: '1000' }], ...body });

  it('marks each kind of medicine in the search, the quote and the settings', async () => {
    /** @type {Record<string, unknown>} */
    const kinds = {};
    for (const q of ['amox', 'calm', 'testa']) {
      const search = await cashier.agent.get(`${API}/batches`).query({ q });
      for (const batch of search.body.data.batches) kinds[batch.batchNo] = batch.medicineKind;
    }
    expect(kinds).toEqual({ 'AMX-1': 'antibiotic', 'CAL-1': 'controlled', 'TST-1': null });
    const quote = await cashier.agent
      .post(`${API}/quote`)
      .set('x-csrf-token', cashier.csrf)
      .send({
        lines: [
          { stockId: ids['HYP-1'], quantity: 1 },
          { stockId: ids['TST-1'], quantity: 1 },
        ],
      });
    expect(quote.body.data.lines.map((/** @type {any} */ l) => l.medicineKind)).toEqual([
      'prescription',
      null,
    ]);
    const settings = await cashier.agent.get(`${API}/till-settings`);
    expect(settings.body.data.medicineTypes).toEqual([
      { kind: 'prescription', code: 'H', name: 'Prescription only' },
      { kind: 'controlled', code: 'X', name: 'Controlled' },
      { kind: 'antibiotic', code: 'H1', name: 'Antibiotic' },
    ]);
  });

  it('finds active doctors by name or licence, never the "no doctor" placeholder', async () => {
    const find = async (/** @type {string} */ q) =>
      (await cashier.agent.get(`${API}/doctors`).query({ q })).body.data;
    expect(await find('am de')).toEqual([
      {
        id: ids.Amani,
        name: 'Amani Demo',
        licenseNumber: 'TEST-0001',
        hospitalId: ids['Sample Medical Centre'],
        hospitalName: 'Sample Medical Centre',
      },
    ]);
    expect((await find('TEST-000')).map((/** @type {any} */ d) => d.name)).toEqual([
      'Amani Demo',
      'Bora Example',
    ]);
    expect(await find('N/')).toEqual([]);
    const hospitals = await cashier.agent.get(`${API}/hospitals`).query({ q: 'clinic' });
    expect(hospitals.body.data).toEqual([]);
  });

  it('adds a doctor from the till', async () => {
    const response = await cashier.agent
      .post(`${API}/doctors`)
      .set('x-csrf-token', cashier.csrf)
      .send({ firstName: 'Chausiku', lastName: 'Sample', licenseNumber: 'TEST-0009' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ name: 'Chausiku Sample', hospitalId: null });
    const refused = await cashier.agent
      .post(`${API}/doctors`)
      .set('x-csrf-token', cashier.csrf)
      .send({ firstName: 'Dalia', lastName: 'Sample', hospitalId: ids['Closed Clinic'] });
    expect(refused.status).toBe(400);
  });

  it("saves the doctor, the doctor's hospital, the date and the photo with the bill", async () => {
    const response = await sell({
      lines: [{ stockId: ids['HYP-1'], quantity: 1 }],
      prescription: { doctorId: ids.Amani, prescribedOn: '2026-01-15', photo: PHOTO },
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      prescriberName: 'Amani Demo',
      hospitalName: 'Sample Medical Centre',
      prescriptionDate: '2026-01-15',
      hasPrescriptionPhoto: true,
    });
    const photo = await cashier.agent
      .get(`${API}/bills/${response.body.data.id}/prescription-photo`)
      .buffer(true);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/png');
    expect(photo.body.length).toBeGreaterThan(0);
    const [seen] = await db.select`
      SELECT COUNT(*) AS n FROM ih_audit_log
      WHERE ACTION = 'sales/bills.prescription-photo.view' AND RESOURCE_ID = ${String(response.body.data.id)}`;
    expect(Number(seen.n)).toBe(1);

    const history = await cashier.agent.get(`${API}/bills/${response.body.data.id}/history`);
    expect(history.status).toBe(200);
    expect(history.body.data.map((/** @type {any} */ entry) => [entry.action, entry.by])).toEqual([
      ['sale.made', 'Carl Cashier'],
      ['prescription-photo.taken', 'Carl Cashier'],
    ]);
  });

  it('keeps the legacy placeholder on a bill without a doctor, and shows it as none', async () => {
    const response = await sell({ lines: [{ stockId: ids['HYP-1'], quantity: 1 }] });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      prescriberName: null,
      prescriptionDate: null,
      hasPrescriptionPhoto: false,
    });
    const [bill] =
      await db.select`SELECT PROVIDER_ID AS doctor FROM sales WHERE BILL_ID = ${response.body.data.id}`;
    expect(Number(bill.doctor)).toBe(ids['N/A']);
  });

  it('refuses an inactive doctor, a future date and a photo that is too large', async () => {
    const response = await sell({
      lines: [{ stockId: ids['AMX-1'], quantity: 1 }],
      prescription: {
        doctorId: ids.Amara,
        prescribedOn: '2999-01-01',
        photo: `data:image/jpeg;base64,${Buffer.alloc((PHOTO_MAX_KB + 1) * 1024).toString('base64')}`,
      },
    });
    expect(response.status).toBe(400);
    expect(response.body.error.details.map((/** @type {any} */ d) => d.path).sort()).toEqual([
      'body.prescription.doctorId',
      'body.prescription.photo',
      'body.prescription.prescribedOn',
    ]);
  });
});

describe('controlled drugs at the till', () => {
  /** @type {{ agent: import('supertest').Agent, csrf: string }} */
  let cashier;

  beforeAll(async () => {
    const agent = request.agent(app);
    const response = await agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'test.cashier', password: 'Test-Cashier-Pass-1' });
    cashier = { agent, csrf: response.body.data.csrfToken };
  });

  /** @param {Record<string, unknown>} body */
  const sell = (body) =>
    cashier.agent
      .post(`${API}/bills`)
      .set('x-csrf-token', cashier.csrf)
      .send({ requestKey: randomUUID(), payments: [{ method: 'cash', amount: '1000' }], ...body });

  it('refuses a controlled drug without what the register needs, saying what is missing', async () => {
    const response = await sell({ lines: [{ stockId: ids['CAL-1'], quantity: 2 }] });
    expect(response.status).toBe(400);
    expect(response.body.error.details.map((/** @type {any} */ d) => d.path)).toEqual([
      'body.customerName',
      'body.customerPhone',
      'body.prescription.doctorId',
      'body.prescription.prescribedOn',
      'body.prescription.patientIdNumber',
    ]);
    const [stock] =
      await db.select`SELECT QUANTITY AS q FROM stock WHERE STOCK_ID = ${ids['CAL-1']}`;
    expect(Number(stock.q)).toBe(50);
  });

  it('sells it with the details and writes the register entry with the bill', async () => {
    const response = await sell({
      customerName: 'Jane Testcase',
      customerPhone: '0700000104',
      lines: [
        { stockId: ids['CAL-1'], quantity: 2 },
        { stockId: ids['TST-1'], quantity: 1 },
      ],
      prescription: { doctorId: ids.Bora, prescribedOn: '2026-11-01', patientIdNumber: 'test1234' },
    });
    expect(response.status).toBe(201);
    const rows = await db.select`
      SELECT ITEM_ID AS itemId, STOCK_ID AS stockId, QUANTITY AS quantity, PATIENT_NAME AS name,
        PATIENT_PHONE AS phone, PATIENT_ID_NUMBER AS idNumber, DOCTOR_ID AS doctor,
        CAST(PRESCRIBED_ON AS CHAR) AS prescribedOn
      FROM ih_controlled_dispense WHERE BILL_ID = ${response.body.data.id}`;
    expect(rows).toEqual([
      {
        itemId: expect.any(Number),
        stockId: ids['CAL-1'],
        quantity: 2,
        name: 'Jane Testcase',
        phone: '0700000104',
        idNumber: 'TEST1234',
        doctor: ids.Bora,
        prescribedOn: '2026-11-01',
      },
    ]);
  });
});

describe('setting the medicine type of many items', () => {
  /** @type {{ agent: import('supertest').Agent, csrf: string }} */
  let admin;

  beforeAll(async () => {
    // The administrator role keeps the master data.
    await db.prisma
      .$executeRaw`INSERT INTO ih_role_permission (ROLE_ID, PHARMA_ACCESS_ID) VALUES (1, ${PERMISSIONS.MASTER_MASTERS_ENTRY.id})`;
    const agent = request.agent(app);
    const response = await agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'test.admin', password: 'Test-Admin-Pass-1' });
    admin = { agent, csrf: response.body.data.csrfToken };
  });

  it('marks the items chosen, clears it again, and refuses a type not on the list', async () => {
    const [testamol] = await db.select`SELECT ITEM_ID AS id FROM items WHERE ITEM_CD = 'TST500'`;
    /** @param {Record<string, unknown>} body */
    const set = (body) =>
      admin.agent
        .post('/api/v1/masters/items/medicine-type')
        .set('x-csrf-token', admin.csrf)
        .send(body);
    const typeOf = async () =>
      (
        await db.select`SELECT SCHEDULE_CATEGORY_CODE_ID AS code FROM items WHERE ITEM_ID = ${testamol.id}`
      )[0].code;

    const marked = await set({ itemIds: [testamol.id], scheduleCodeId: ids['schedule X'] });
    expect(marked.body.data).toEqual({ updated: 1 });
    expect(await typeOf()).toBe(ids['schedule X']);
    await set({ itemIds: [testamol.id], scheduleCodeId: null });
    expect(await typeOf()).toBeNull();
    expect((await set({ itemIds: [testamol.id], scheduleCodeId: 999 })).status).toBe(400);
    const [audited] = await db.select`
      SELECT COUNT(*) AS n FROM ih_audit_log WHERE ACTION = 'masters/items.medicine-type'`;
    expect(Number(audited.n)).toBe(2);

    const history = await admin.agent.get('/api/v1/masters/items/medicine-type/history');
    expect(history.body.data.slice(0, 2)).toMatchObject([
      { subjectId: String(testamol.id), by: 'Ada Admin', details: { from: 'X', to: null } },
      { subjectId: String(testamol.id), details: { from: null, to: 'X' } },
    ]);
  });

  it('is only for people who keep the master data', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ identifier: 'test.cashier', password: 'Test-Cashier-Pass-1' });
    const response = await agent
      .post('/api/v1/masters/items/medicine-type')
      .set('x-csrf-token', login.body.data.csrfToken)
      .send({ itemIds: [1], scheduleCodeId: null });
    expect(response.status).toBe(403);
  });
});

describe('a pharmacy that turns the controlled-drug rules off', () => {
  /** @type {{ agent: import('supertest').Agent, csrf: string }} */
  let admin;
  /** @type {{ agent: import('supertest').Agent, csrf: string }} */
  let cashier;

  /**
   * @param {string} identifier
   * @param {string} password
   */
  const signIn = async (identifier, password) => {
    const agent = request.agent(app);
    const response = await agent.post('/api/v1/auth/login').send({ identifier, password });
    return { agent, csrf: response.body.data.csrfToken };
  };
  /** @param {boolean} controlledDrugRules */
  const setRules = (controlledDrugRules) =>
    admin.agent
      .put('/api/v1/masters/sales-settings')
      .set('x-csrf-token', admin.csrf)
      .send({ controlledDrugRules });

  beforeAll(async () => {
    admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    cashier = await signIn('test.cashier', 'Test-Cashier-Pass-1');
  });

  it('starts with the rules on, and only the people who keep master data can change it', async () => {
    expect((await admin.agent.get('/api/v1/masters/sales-settings')).body.data).toEqual({
      controlledDrugRules: true,
    });
    const denied = await cashier.agent
      .put('/api/v1/masters/sales-settings')
      .set('x-csrf-token', cashier.csrf)
      .send({ controlledDrugRules: false });
    expect(denied.status).toBe(403);
  });

  it('sells a controlled drug without the details, keeping what was entered for the register', async () => {
    const off = await setRules(false);
    expect(off.body.data).toEqual({ controlledDrugRules: false });
    const till = await cashier.agent.get(`${API}/till-settings`);
    expect(till.body.data.controlledDrugRules).toBe(false);

    const sale = await cashier.agent
      .post(`${API}/bills`)
      .set('x-csrf-token', cashier.csrf)
      .send({
        requestKey: randomUUID(),
        customerName: 'John Sample',
        lines: [{ stockId: ids['CAL-1'], quantity: 1 }],
        payments: [{ method: 'cash', amount: '100' }],
      });
    expect(sale.status).toBe(201);
    const [entry] = await db.select`
      SELECT PATIENT_NAME AS name, PATIENT_PHONE AS phone, PATIENT_ID_NUMBER AS idNumber, DOCTOR_ID AS doctor
      FROM ih_controlled_dispense WHERE BILL_ID = ${sale.body.data.id}`;
    expect(entry).toEqual({ name: 'John Sample', phone: null, idNumber: null, doctor: null });

    const [audited] = await db.select`
      SELECT DETAILS AS details FROM ih_audit_log WHERE ACTION = 'masters/sales-settings.update'`;
    expect(audited.details).toMatchObject({
      before: { controlledDrugRules: true },
      after: { controlledDrugRules: false },
    });
  });

  it('requires the details again once the rules are back on', async () => {
    await setRules(true);
    const sale = await cashier.agent
      .post(`${API}/bills`)
      .set('x-csrf-token', cashier.csrf)
      .send({
        requestKey: randomUUID(),
        lines: [{ stockId: ids['CAL-1'], quantity: 1 }],
        payments: [{ method: 'cash', amount: '100' }],
      });
    expect(sale.status).toBe(400);

    const history = await admin.agent.get('/api/v1/masters/sales-settings/history');
    expect(history.body.data.map((/** @type {any} */ entry) => entry.details)).toEqual([
      { from: false, to: true },
      { from: true, to: false },
    ]);
  });
});
