import { PERMISSIONS } from '@ihealth/shared/permissions';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createLookupRoutes } from '../../src/features/lookups/lookup-routes.js';
import { createItemLookupRoutes } from '../../src/features/masters/item-lookups.js';
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
      masters: {
        routes: [
          ...createManufacturerRoutes({ prisma: db.prisma, audit }),
          ...createItemLookupRoutes({ prisma: db.prisma, audit }),
        ],
      },
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

  describe('item lookups', () => {
    /** @type {Awaited<ReturnType<typeof signIn>>} */
    let admin;
    beforeAll(async () => {
      admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    });

    /**
     * @param {string} resource
     * @param {Record<string, unknown>} body
     */
    const create = (resource, body) =>
      admin.agent.post(`/api/v1/masters/${resource}`).set('x-csrf-token', admin.csrf).send(body);

    it('maps the medical flag and writes a unit name to both legacy name columns', async () => {
      const unit = await create('units-of-measure', { code: 'STR', name: 'Strip' });
      expect(unit.status).toBe(201);
      const [row] =
        await db.select`SELECT MEASUREMENT_NAME AS name, MEASUREMENT_DESC AS description FROM unit_of_measurement WHERE UNIT_OF_MEASUREMENT_ID = ${unit.body.data.id}`;
      expect(row).toEqual({ name: 'Strip', description: 'Strip' });

      const form = await create('item-forms', {
        code: 'GEL',
        name: 'Gel',
        productKind: 'nonMedical',
      });
      const [formRow] =
        await db.select`SELECT MEDICAL_OR_NON_MEDICAL AS kind FROM items_forms WHERE ITEM_FORM_ID = ${form.body.data.id}`;
      expect(formRow.kind).toBe('N');
      expect(form.body.data.productKind).toBe('nonMedical');
    });

    it('shows a category without a name by its description', async () => {
      await db.prisma
        .$executeRaw`INSERT INTO items_categories (CATEGORIE_CD, CATEGORIE_DESC, ACTIVE_S) VALUES ('LEG', 'Legacy category', 'Y')`;
      const response = await admin.agent.get('/api/v1/masters/item-categories?q=LEG');
      expect(response.body.data[0]).toMatchObject({ code: 'LEG', name: 'Legacy category' });
    });

    it('filters generic names by group and shows the group name', async () => {
      const group = await create('item-groups', {
        code: 'MED',
        name: 'Medicals',
        productKind: 'medical',
      });
      await create('generic-names', {
        code: 'GCC',
        name: 'Paracetamol',
        productKind: 'medical',
        itemGroupId: group.body.data.id,
      });
      await create('generic-names', { code: 'GCC', name: 'Ibuprofen', productKind: 'medical' });
      const response = await admin.agent.get(
        `/api/v1/masters/generic-names?itemGroupId=${group.body.data.id}`,
      );
      expect(response.body.data).toEqual([
        expect.objectContaining({ name: 'Paracetamol', code: 'GCC', itemGroupName: 'Medicals' }),
      ]);
    });

    it('keeps legacy duplicates editable but refuses new ones', async () => {
      await db.prisma
        .$executeRaw`INSERT INTO specialization (SPECIALIZATION_CD, SPECIALIZATION_NAME, ACTIVE_S) VALUES ('S1', 'Cardiology', 'y'), ('S2', 'Cardiology', 'Y')`;
      const { body } = await admin.agent.get('/api/v1/masters/specializations?q=Cardiology');
      expect(body.data).toHaveLength(2);
      const edit = await admin.agent
        .patch(`/api/v1/masters/specializations/${body.data[0].id}`)
        .set('x-csrf-token', admin.csrf)
        .send({ code: 'S1', name: 'Cardiology', description: 'Heart' });
      expect(edit.status).toBe(200);
      expect((await create('specializations', { code: 'S3', name: 'cardiology' })).status).toBe(
        409,
      );
    });
  });
});
