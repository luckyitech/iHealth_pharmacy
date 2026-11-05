import { PERMISSIONS } from '@ihealth/shared/permissions';
import pino from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createAuditLog } from '../../src/features/audit/audit-log.js';
import { createAuthModule } from '../../src/features/auth/auth.module.js';
import { createLookupRoutes } from '../../src/features/lookups/lookup-routes.js';
import { createCustomerRoutes } from '../../src/features/masters/customers.js';
import { createHospitalRoutes } from '../../src/features/masters/hospitals.js';
import { createItemLookupRoutes } from '../../src/features/masters/item-lookups.js';
import { createItemRoutes } from '../../src/features/masters/items.js';
import { createManufacturerRoutes } from '../../src/features/masters/manufacturers.js';
import { createPharmacyProfileRoutes } from '../../src/features/masters/pharmacy-profile.js';
import { createProviderRoutes } from '../../src/features/masters/providers.js';
import { createSupplierRoutes } from '../../src/features/masters/suppliers.js';
import { createTermsRoutes } from '../../src/features/masters/terms.js';
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
          ...createHospitalRoutes({ prisma: db.prisma, audit }),
          ...createProviderRoutes({ prisma: db.prisma, audit }),
          ...createTermsRoutes({ prisma: db.prisma, audit }),
          ...createPharmacyProfileRoutes({ prisma: db.prisma, audit, config }),
          ...createItemRoutes({ prisma: db.prisma, audit, config }),
          ...createSupplierRoutes({ prisma: db.prisma, audit }),
          ...createCustomerRoutes({ prisma: db.prisma, audit, config }),
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

describe('organisation masters', () => {
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let admin;
  beforeAll(async () => {
    admin = await signIn('test.admin', 'Test-Admin-Pass-1');
  });

  it('reads hospitals even when legacy rows hold zero dates', async () => {
    // A zero date can only be written with strict mode off, on the same connection (one transaction).
    await db.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET SESSION sql_mode = ''`;
      await tx.$executeRaw`INSERT INTO hospital (NAME, ACTIVE_S, CREATION_TS, LAST_UPDATE_TS) VALUES ('Legacy Hospital', 'Y', NOW(), '0000-00-00 00:00:00')`;
      await tx.$executeRaw`SET SESSION sql_mode = DEFAULT`;
    });
    const response = await admin.agent.get('/api/v1/masters/hospitals?q=Legacy');
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ name: 'Legacy Hospital', active: true });
  });

  it("shows a provider's hospital and type, and checks licence numbers only when given", async () => {
    const hospital = await admin.agent
      .post('/api/v1/masters/hospitals')
      .set('x-csrf-token', admin.csrf)
      .send({ name: 'City Clinic' });
    await db.prisma
      .$executeRaw`INSERT INTO provider_type_lookup (PROVIDER_TYPE_CD, PROVIDER_TYPE_DESC, CREATION_USER_ID) VALUES ('PD', 'PHYSICIAN', 'test')`;
    const [type] =
      await db.select`SELECT PROVIDER_TYPE_LOOKUP_ID AS id FROM provider_type_lookup WHERE PROVIDER_TYPE_CD = 'PD'`;
    const created = await admin.agent
      .post('/api/v1/masters/providers')
      .set('x-csrf-token', admin.csrf)
      .send({
        firstName: 'Amina',
        lastName: 'Otieno',
        gender: 'F',
        licenseNumber: 'A123',
        providerTypeId: type.id,
        hospitalId: hospital.body.data.id,
      });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      hospitalName: 'City Clinic',
      providerTypeName: 'PHYSICIAN',
      gender: 'F',
    });

    const noLicence = await admin.agent
      .post('/api/v1/masters/providers')
      .set('x-csrf-token', admin.csrf)
      .send({ firstName: 'Peter', lastName: 'Kamau', licenseNumber: '' });
    expect(noLicence.status).toBe(201);
    const duplicate = await admin.agent
      .post('/api/v1/masters/providers')
      .set('x-csrf-token', admin.csrf)
      .send({ firstName: 'Other', lastName: 'Person', licenseNumber: 'a123' });
    expect(duplicate.status).toBe(409);
  });

  it('edits the pharmacy profile and stores a validated logo', async () => {
    const profile = await admin.agent.get('/api/v1/masters/pharmacy-profile');
    expect(profile.status).toBe(200);
    expect(profile.body.data).toMatchObject({ name: 'Test Pharmacy', hasLogo: false });

    const updated = await admin.agent
      .patch('/api/v1/masters/pharmacy-profile')
      .set('x-csrf-token', admin.csrf)
      .send({ phone: '+254700111222', openAllHours: true });
    expect(updated.body.data).toMatchObject({
      phone: '+254700111222',
      openAllHours: true,
      name: 'Test Pharmacy',
    });
    const [row] = await db.select`SELECT 24_HOURS AS allHours FROM pharmacy WHERE PHARMACY_ID = 1`;
    expect(row.allHours).toBe('Y');

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const fake = await admin.agent
      .put('/api/v1/masters/pharmacy-profile/logo')
      .set('x-csrf-token', admin.csrf)
      .set('content-type', 'image/png')
      .send(Buffer.from('not an image'));
    expect(fake.status).toBe(400);
    const saved = await admin.agent
      .put('/api/v1/masters/pharmacy-profile/logo')
      .set('x-csrf-token', admin.csrf)
      .set('content-type', 'image/png')
      .send(png);
    expect(saved.status).toBe(204);
    const logo = await request(app).get('/api/v1/masters/pharmacy-profile/logo');
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect((await admin.agent.get('/api/v1/masters/pharmacy-profile')).body.data.hasLogo).toBe(
      true,
    );
  });

  it('manages terms texts', async () => {
    const created = await admin.agent
      .post('/api/v1/masters/terms')
      .set('x-csrf-token', admin.csrf)
      .send({ text: 'Goods once sold cannot be returned.' });
    expect(created.status).toBe(201);
    expect((await admin.agent.get('/api/v1/masters/terms')).body.data[0].text).toBe(
      'Goods once sold cannot be returned.',
    );
  });
});

describe('item master', () => {
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let admin;
  /** @type {Record<string, number>} */
  const ids = {};

  /**
   * @param {string} path
   * @param {Record<string, unknown>} body
   * @returns {Promise<number>}
   */
  const create = async (path, body) => {
    const response = await admin.agent
      .post(`/api/v1/masters/${path}`)
      .set('x-csrf-token', admin.csrf)
      .send(body);
    expect(response.status).toBe(201);
    return response.body.data.id;
  };

  beforeAll(async () => {
    admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    ids.group = await create('item-groups', {
      code: 'TAB',
      name: 'Tablets',
      productKind: 'medical',
    });
    ids.form = await create('item-forms', { code: 'T', name: 'Tablet', productKind: 'medical' });
    ids.unit = await create('units-of-measure', { code: 'PC', name: 'Piece' });
    ids.manufacturer = await create('manufacturers', { name: 'Cosmos Ltd' });
    await db.prisma
      .$executeRaw`INSERT INTO taxcategory (CATEGORY_CODE, CATEGORY_VALUE, ACTIVE_S) VALUES ('A', 16, 'Y'), ('A', 14, 'N')`;
    const [tax] =
      await db.select`SELECT TAXCATEGORY_ID AS id FROM taxcategory WHERE CATEGORY_VALUE = 16`;
    ids.tax = tax.id;
  });

  const item = () => ({
    name: 'Paracetamol 500mg',
    productKind: 'medical',
    groupId: ids.group,
    formId: ids.form,
    manufacturerId: ids.manufacturer,
    purchaseUnitId: ids.unit,
    issueUnitId: ids.unit,
    taxCategoryId: ids.tax,
    pack: '100',
    barcode: '6001234567890',
  });

  it('creates an item with a generated code, the pharmacy and the names of its lookups', async () => {
    const response = await admin.agent
      .post('/api/v1/masters/items')
      .set('x-csrf-token', admin.csrf)
      .send(item());
    expect(response.status).toBe(201);
    const { id } = response.body.data;
    expect(response.body.data).toMatchObject({
      code: `IC${String(id).padStart(7, '0')}`,
      groupName: 'Tablets',
      formName: 'Tablet',
      manufacturerName: 'Cosmos Ltd',
      purchaseUnitName: 'Piece',
      taxCategoryName: 'A (16%)',
      productKind: 'medical',
    });
    const [row] =
      await db.select`SELECT PHARMACY_ID AS pharmacyId, MEDICAL_OR_NON_MEDICAL AS kind FROM items WHERE ITEM_ID = ${id}`;
    expect(row).toEqual({ pharmacyId: 1, kind: 'M' });
  });

  it('requires the essentials and refuses a barcode already in use', async () => {
    const missing = await admin.agent
      .post('/api/v1/masters/items')
      .set('x-csrf-token', admin.csrf)
      .send({ name: 'Incomplete', productKind: 'medical' });
    expect(missing.status).toBe(400);
    const paths = missing.body.error.details.map((/** @type {any} */ detail) => detail.path);
    expect(paths).toEqual(
      expect.arrayContaining(['body.groupId', 'body.manufacturerId', 'body.taxCategoryId']),
    );

    const duplicate = await admin.agent
      .post('/api/v1/masters/items')
      .set('x-csrf-token', admin.csrf)
      .send({ ...item(), name: 'Another' });
    expect(duplicate.status).toBe(409);
  });

  it('offers only active tax rates', async () => {
    const response = await admin.agent.get('/api/v1/lookups/tax-categories');
    expect(response.body.data).toEqual([{ id: ids.tax, name: 'A (16%)' }]);
  });

  it('refuses to deactivate an item that has stock, and allows it once the stock is cleared', async () => {
    const id = await create('items', { ...item(), name: 'Amoxicillin', barcode: '' });
    await db.prisma
      .$executeRaw`INSERT INTO stock (ITEM_ID, PHARMACY_ID, QUANTITY) VALUES (${id}, 1, 12)`;
    const refused = await admin.agent
      .delete(`/api/v1/masters/items/${id}`)
      .set('x-csrf-token', admin.csrf);
    expect(refused.status).toBe(409);

    await db.prisma.$executeRaw`UPDATE stock SET QUANTITY = 0 WHERE ITEM_ID = ${id}`;
    const allowed = await admin.agent
      .delete(`/api/v1/masters/items/${id}`)
      .set('x-csrf-token', admin.csrf);
    expect(allowed.status).toBe(204);
  });

  it('searches by name, code or barcode and filters by kind', async () => {
    const byBarcode = await admin.agent.get('/api/v1/masters/items?q=600123');
    expect(byBarcode.body.data.map((/** @type {any} */ row) => row.name)).toEqual([
      'Paracetamol 500mg',
    ]);
    const nonMedical = await admin.agent.get('/api/v1/masters/items?productKind=nonMedical');
    expect(nonMedical.body.data).toEqual([]);
  });
});

describe('suppliers', () => {
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let admin;
  /** @type {{ countryId: number, provinceId: number, creditTypeId: number }} */
  let ids;

  beforeAll(async () => {
    admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    await db.prisma.$executeRaw`INSERT INTO return_credit_type (TYPE) VALUES ('CREDIT NOTE')`;
    await db.prisma.$executeRaw`INSERT INTO payment_types (TYPE) VALUES ('CHEQUE')`;
    await db.prisma.$executeRaw`INSERT INTO country_lookup (COUNTRY_NM) VALUES ('Kenya')`;
    const [country] =
      await db.select`SELECT COUNTRY_ID AS id FROM country_lookup WHERE COUNTRY_NM = 'Kenya'`;
    await db.prisma
      .$executeRaw`INSERT INTO provinces_lookup (PROVINCES_NM, COUNTRY_ID) VALUES ('Nairobi', ${country.id})`;
    const [province] =
      await db.select`SELECT PROVINCES_ID AS id FROM provinces_lookup WHERE COUNTRY_ID = ${country.id}`;
    const [credit] = await db.select`SELECT RETURN_CREDIT_TYPE_ID AS id FROM return_credit_type`;
    ids = { countryId: country.id, provinceId: province.id, creditTypeId: credit.id };
  });

  const supplier = () => ({
    name: 'Harleys Ltd',
    taxPin: 'P000000009Z',
    supplies: 'both',
    addressLine1: 'Mombasa Road',
    countryId: ids.countryId,
    provinceId: ids.provinceId,
    returnCreditTypeId: ids.creditTypeId,
    creditDays: 30,
    contactEmail2: 'orders@harleys.example',
    alsoManufacturer: false,
    allowOnlineOrders: true,
    allowManualOrders: true,
    allowPhoneOrders: false,
    acceptExpiryReturns: true,
    acceptDamagedReturns: false,
    acceptGoodReturns: true,
  });

  it('creates a supplier, mapping the flags and the legacy columns', async () => {
    const created = await admin.agent
      .post('/api/v1/masters/suppliers')
      .set('x-csrf-token', admin.csrf)
      .send(supplier());
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      supplies: 'both',
      creditDays: 30,
      returnCreditTypeName: 'CREDIT NOTE',
      allowPhoneOrders: false,
      acceptExpiryReturns: true,
    });
    const [row] =
      await db.select`SELECT LICENSE AS pin, SUPPLIES_MEDICAL_NON_MEDICAL_BOTH AS supplies, ALLOW_PHONE_ORDERS AS phone, CONTACT_PERSON_EMAIL_TWO AS email2 FROM supplier WHERE SUPPLIER_ID = ${created.body.data.id}`;
    expect(row).toEqual({
      pin: 'P000000009Z',
      supplies: 'B',
      phone: 'N',
      email2: 'orders@harleys.example',
    });
  });

  it('refuses a tax PIN already in use and requires the address and return terms', async () => {
    const duplicate = await admin.agent
      .post('/api/v1/masters/suppliers')
      .set('x-csrf-token', admin.csrf)
      .send({ ...supplier(), name: 'Other Ltd', taxPin: 'p000000009z' });
    expect(duplicate.status).toBe(409);

    const missing = await admin.agent
      .post('/api/v1/masters/suppliers')
      .set('x-csrf-token', admin.csrf)
      .send({ name: 'Partial Ltd', taxPin: 'P1' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.map((/** @type {any} */ detail) => detail.path)).toEqual(
      expect.arrayContaining(['body.addressLine1', 'body.countryId', 'body.returnCreditTypeId']),
    );
  });

  it('lets "Update Supplier" change suppliers but not other masters', async () => {
    await db.prisma
      .$executeRaw`INSERT INTO employee_access (EMPLOYEE_ID, PHARMA_ACCESS_ID, ACTIVE_S, CREATION_USER_ID) VALUES (2, ${PERMISSIONS.MASTER_UPDATE_SUPPLIER.id}, 'Y', 'test')`;
    const cashier = await signIn('test.cashier', 'Test-Cashier-Pass-1');
    const list = await cashier.agent.get('/api/v1/masters/suppliers');
    const id = list.body.data[0].id;
    const updated = await cashier.agent
      .patch(`/api/v1/masters/suppliers/${id}`)
      .set('x-csrf-token', cashier.csrf)
      .send({ creditDays: 45 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.creditDays).toBe(45);
    const manufacturer = await cashier.agent
      .post('/api/v1/masters/manufacturers')
      .set('x-csrf-token', cashier.csrf)
      .send({ name: 'Not allowed' });
    expect(manufacturer.status).toBe(403);
  });

  it('serves the payment and return-credit types', async () => {
    const payment = await admin.agent.get('/api/v1/lookups/payment-types');
    expect(payment.body.data).toEqual([expect.objectContaining({ name: 'CHEQUE' })]);
    const credit = await admin.agent.get('/api/v1/lookups/return-credit-types');
    expect(credit.body.data).toEqual([expect.objectContaining({ name: 'CREDIT NOTE' })]);
  });
});

describe('customers', () => {
  /** @type {Awaited<ReturnType<typeof signIn>>} */
  let admin;
  /** @type {{ countryId: number, provinceId: number }} */
  let place;

  beforeAll(async () => {
    admin = await signIn('test.admin', 'Test-Admin-Pass-1');
    await db.prisma.$executeRaw`INSERT INTO country_lookup (COUNTRY_NM) VALUES ('Uganda')`;
    const [country] =
      await db.select`SELECT COUNTRY_ID AS id FROM country_lookup WHERE COUNTRY_NM = 'Uganda'`;
    await db.prisma
      .$executeRaw`INSERT INTO provinces_lookup (PROVINCES_NM, COUNTRY_ID) VALUES ('Kampala', ${country.id})`;
    const [province] =
      await db.select`SELECT PROVINCES_ID AS id FROM provinces_lookup WHERE COUNTRY_ID = ${country.id}`;
    place = { countryId: country.id, provinceId: province.id };
  });

  /**
   * @param {Record<string, unknown>} body
   */
  const create = (body) =>
    admin.agent
      .post('/api/v1/masters/customers')
      .set('x-csrf-token', admin.csrf)
      .send({ kind: 'individual', ...place, ...body });

  it('creates a customer with a date of birth, stored as the same calendar day', async () => {
    const created = await create({
      firstName: 'Test',
      lastName: 'Customer',
      phone: '0700 000 101',
      gender: 'F',
      birthDate: '1990-03-31',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      birthDate: '1990-03-31',
      gender: 'F',
      kind: 'individual',
    });
    const [row] =
      await db.select`SELECT CAST(DOB_DT AS CHAR) AS dob, PHARMACY_ID AS pharmacyId, CORPORATE AS corporate FROM customer WHERE CUSTOMER_ID = ${created.body.data.id}`;
    expect(row).toEqual({ dob: '1990-03-31', pharmacyId: 1, corporate: 'N' });
  });

  it('allows a shared phone number, refuses an invalid one and a future birth date', async () => {
    expect((await create({ firstName: 'Amina', phone: '0700 000 101' })).status).toBe(201);
    const invalid = await create({ firstName: 'X', phone: 'call me', birthDate: '2999-01-01' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details.map((/** @type {any} */ detail) => detail.path)).toEqual(
      expect.arrayContaining(['body.phone', 'body.birthDate']),
    );
  });

  it('keeps company details only for corporate customers, and filters by kind', async () => {
    const company = await create({
      kind: 'corporate',
      firstName: 'Accounts',
      phone: '0200000000',
      organisation: 'Dawa Ltd',
      taxNumber: 'P000111222Z',
    });
    expect(company.body.data).toMatchObject({ kind: 'corporate', organisation: 'Dawa Ltd' });
    const individual = await admin.agent
      .patch(`/api/v1/masters/customers/${company.body.data.id}`)
      .set('x-csrf-token', admin.csrf)
      .send({ kind: 'individual' });
    expect(individual.body.data).toMatchObject({ organisation: null, taxNumber: null });

    await create({
      kind: 'corporate',
      firstName: 'Buyer',
      phone: '0200000001',
      organisation: 'Afya',
    });
    const corporates = await admin.agent.get('/api/v1/masters/customers?kind=corporate');
    expect(corporates.body.data.map((/** @type {any} */ row) => row.organisation)).toEqual([
      'Afya',
    ]);
    const byPhone = await admin.agent.get('/api/v1/masters/customers?q=0700000');
    expect(byPhone.body.meta.total).toBe(2);
    expect(byPhone.body.data[0].phone).toBe('0700000101');
  });

  it('lists a customer whose stored birth date is a zero date', async () => {
    await db.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET SESSION sql_mode = ''`;
      await tx.$executeRaw`INSERT INTO customer (PHONE_NBR, FIRST_NM, DOB_DT, ACTIVE_S) VALUES ('0711000000', 'Legacy', '0000-00-00', 'Y')`;
      await tx.$executeRaw`SET SESSION sql_mode = DEFAULT`;
    });
    const response = await admin.agent.get('/api/v1/masters/customers?q=Legacy');
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ firstName: 'Legacy', birthDate: null });
  });
});
