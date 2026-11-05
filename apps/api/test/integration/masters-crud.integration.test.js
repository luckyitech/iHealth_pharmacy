import { PERMISSIONS } from '@ihealth/shared/permissions';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createLookupRoutes } from '../../src/features/lookups/lookup-routes.js';
import { createManufacturerRoutes } from '../../src/features/masters/manufacturers.js';
import { collectRoutes } from '../../src/routes.js';
import { buildTestApp, TEST_ENV } from '../helpers.js';
import { startTestDatabase } from './database.js';

const RESOURCE = '/api/v1/masters/manufacturers';

/** @type {Awaited<ReturnType<typeof startTestDatabase>>} */
let db;
/** @type {import('express').Express} */
let app;

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
      lookups: { routes: createLookupRoutes({ prisma: db.prisma }) },
      masters: { routes: createManufacturerRoutes({ prisma: db.prisma, audit }) },
    }),
    guards: auth.guards,
  });
  // The admin edits masters; the cashier may only look.
  await db.prisma
    .$executeRaw`INSERT INTO ih_role_permission (ROLE_ID, PHARMA_ACCESS_ID) VALUES (1, ${PERMISSIONS.MASTER_MASTERS_ENTRY.id})`;
  await db.prisma
    .$executeRaw`INSERT INTO employee_access (EMPLOYEE_ID, PHARMA_ACCESS_ID, ACTIVE_S, CREATION_USER_ID) VALUES (2, ${PERMISSIONS.MASTER_MASTERS_VIEW.id}, 'Y', 'test')`;
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

describe('master data CRUD against the legacy manufacturer table', () => {
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let admin;
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let viewer;

  beforeAll(async () => {
    admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    viewer = await signIn('test.cashier', 'Test-Cashier-Pass-1');
  });

  it('creates a record, filling the legacy audit columns', async () => {
    const response = await admin.agent
      .post(RESOURCE)
      .set('x-csrf-token', admin.csrf)
      .send({ name: '  Acme Pharma ', email: 'Orders@Acme.co.ke', city: 'Thika', phone: '' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      name: 'Acme Pharma',
      email: 'orders@acme.co.ke',
      city: 'Thika',
      phone: null,
      active: true,
    });
    const [row] =
      await db.select`SELECT CREATION_USER_ID AS createdBy, ACTIVE_S AS active, YEAR(LAST_UPDATE_TS) AS year FROM manufacturer WHERE MANUFACTURER_ID = ${response.body.data.id}`;
    expect(row).toMatchObject({ createdBy: '1', active: 'Y' });
    expect(Number(row.year)).toBeGreaterThan(2000);
  });

  it('refuses a duplicate name, whatever its case', async () => {
    const response = await admin.agent
      .post(RESOURCE)
      .set('x-csrf-token', admin.csrf)
      .send({ name: 'ACME PHARMA' });
    expect(response.status).toBe(409);
    expect(response.body.error.details).toEqual([
      { path: 'body.name', message: 'A manufacturer with this name already exists' },
    ]);
  });

  it('lists with search, sorting and paging', async () => {
    for (const name of ['Beta Labs', 'Cipla Kenya', 'Dawa Ltd']) {
      await admin.agent.post(RESOURCE).set('x-csrf-token', admin.csrf).send({ name });
    }
    const page = await viewer.agent.get(`${RESOURCE}?sort=-name&pageSize=2`);
    expect(page.status).toBe(200);
    expect(page.body.data.map((/** @type {{ name: string }} */ m) => m.name)).toEqual([
      'Dawa Ltd',
      'Cipla Kenya',
    ]);
    expect(page.body.meta).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });

    const search = await viewer.agent.get(`${RESOURCE}?q=cipla`);
    expect(search.body.data.map((/** @type {{ name: string }} */ m) => m.name)).toEqual([
      'Cipla Kenya',
    ]);
  });

  it('updates only the fields sent, and clears a field sent empty', async () => {
    const { body } = await admin.agent.get(`${RESOURCE}?q=Acme`);
    const id = body.data[0].id;
    const response = await admin.agent
      .patch(`${RESOURCE}/${id}`)
      .set('x-csrf-token', admin.csrf)
      .send({ city: '', license: 'PPB-123' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      name: 'Acme Pharma',
      city: null,
      license: 'PPB-123',
      email: 'orders@acme.co.ke',
    });
  });

  it('deactivates instead of deleting, and can restore', async () => {
    const { body } = await admin.agent.get(`${RESOURCE}?q=Dawa`);
    const id = body.data[0].id;
    expect(
      (await admin.agent.delete(`${RESOURCE}/${id}`).set('x-csrf-token', admin.csrf)).status,
    ).toBe(204);

    expect((await admin.agent.get(`${RESOURCE}?q=Dawa`)).body.data).toEqual([]);
    const inactive = await admin.agent.get(`${RESOURCE}?q=Dawa&status=inactive`);
    expect(inactive.body.data[0]).toMatchObject({ id, active: false });
    const [row] =
      await db.select`SELECT ACTIVE_S AS active FROM manufacturer WHERE MANUFACTURER_ID = ${id}`;
    expect(row.active).toBe('N');

    const restored = await admin.agent
      .post(`${RESOURCE}/${id}/restore`)
      .set('x-csrf-token', admin.csrf);
    expect(restored.body.data.active).toBe(true);
  });

  it('lets "Masters View" read but not write, and audits every write', async () => {
    const write = await viewer.agent
      .post(RESOURCE)
      .set('x-csrf-token', viewer.csrf)
      .send({ name: 'Not allowed' });
    expect(write.status).toBe(403);

    const nobody = await signIn('test.inactive', 'Test-Inactive-Pass-1');
    expect(nobody.csrf).toBeUndefined();

    const actions =
      await db.select`SELECT ACTION AS action, COUNT(*) AS n FROM ih_audit_log WHERE RESOURCE_TYPE = 'masters/manufacturers' GROUP BY ACTION ORDER BY ACTION`;
    expect(actions.map((/** @type {{ action: string }} */ row) => row.action)).toEqual([
      'masters/manufacturers.create',
      'masters/manufacturers.deactivate',
      'masters/manufacturers.restore',
      'masters/manufacturers.update',
    ]);
  });

  it('serves the country and province lookups', async () => {
    const countries = await viewer.agent.get('/api/v1/lookups/countries');
    expect(countries.status).toBe(200);
    expect(Array.isArray(countries.body.data)).toBe(true);
  });
});
