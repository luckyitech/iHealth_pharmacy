/* eslint-disable jsdoc/reject-any-type -- items come from the generic CRUD factory */
import { POLICIES } from '@ihealth/shared/permissions';
import { CUSTOMER_KINDS, customerInputSchema, customerSchema } from '@ihealth/shared/schemas';
import { z } from 'zod';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { currentPharmacyId } from './current-pharmacy.js';
import { columnMapping, LEGACY_STAMPS, legacyDates, toLegacyDate } from './legacy-mapping.js';

/** Legacy `CORPORATE` flag. Other stored values (a few 'S') count as individual customers. */
const CORPORATE_YES = 'Y';
const CORPORATE_NO = 'N';

/** API field -> `customer` column (Prisma field), for text and id fields. */
const COLUMNS = Object.freeze({
  firstName: 'firstNm',
  lastName: 'lastNm',
  phone: 'phoneNbr',
  gender: 'genderCd',
  email: 'emailId',
  addressLine1: 'addressLine1',
  addressLine2: 'addressLine2',
  city: 'cityNm',
  // Labelled "Pin code" on the legacy form: the postal code, not the tax PIN.
  zip: 'pinCd',
  countryId: 'countryId',
  provinceId: 'provincesId',
  organisation: 'organisation',
  taxNumber: 'taxNo',
  contactFirstName: 'contactFirstNm',
  contactLastName: 'contactLastNm',
});

/**
 * Fields that only apply to corporate customers; cleared when a customer becomes an individual.
 *
 * @type {readonly (keyof typeof COLUMNS)[]}
 */
const CORPORATE_FIELDS = Object.freeze([
  'organisation',
  'taxNumber',
  'contactFirstName',
  'contactLastName',
]);

const MAPPING = columnMapping('customerId', COLUMNS, ['firstName', 'phone']);

/** @type {Record<string, boolean>} */
const SELECT = { ...MAPPING.select, corporate: true };

/**
 * @param {Record<string, any>} row
 * @returns {Record<string, unknown>}
 */
function toItem(row) {
  const item = MAPPING.toItem(row);
  return {
    ...item,
    kind:
      row.corporate?.toUpperCase() === CORPORATE_YES
        ? CUSTOMER_KINDS.CORPORATE
        : CUSTOMER_KINDS.INDIVIDUAL,
    gender: /** @type {string | null} */ (item.gender)?.toUpperCase() ?? null,
    birthDate: null,
  };
}

/**
 * @param {Record<string, any>} input
 * @returns {Record<string, unknown>}
 */
function toData(input) {
  /** @type {Record<string, unknown>} */
  const data = MAPPING.toData(input);
  if (input.kind) {
    const corporate = input.kind === CUSTOMER_KINDS.CORPORATE;
    data.corporate = corporate ? CORPORATE_YES : CORPORATE_NO;
    if (!corporate) for (const field of CORPORATE_FIELDS) data[COLUMNS[field]] = null;
  }
  if ('birthDate' in input) {
    data.dobDt = toLegacyDate(input.birthDate);
  }
  return data;
}

/**
 * The people and companies the pharmacy sells to. Most are added at the till; this screen keeps
 * their details up to date.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The customer routes.
 */
export function createCustomerRoutes({ prisma, audit, config }) {
  return createCrudRoutes(
    {
      resource: 'masters/customers',
      label: 'Customer',
      tag: 'Masters',
      delegate: (client) => client.customer,
      idField: 'customerId',
      permissions: POLICIES.masters,
      itemSchema: customerSchema,
      inputSchema: customerInputSchema,
      select: SELECT,
      toItem,
      toData,
      // Read as text: a zero date in a DATE column would fail the whole query through the model.
      enrich: legacyDates('customer', 'CUSTOMER_ID', { birthDate: 'DOB_DT' }),
      sortable: ['firstName', 'lastName', 'phone'],
      sortColumns: { firstName: 'firstNm', lastName: 'lastNm', phone: 'phoneNbr' },
      defaultSort: 'firstName',
      search: (q) => ({
        OR: [
          { firstNm: { contains: q } },
          { lastNm: { contains: q } },
          { phoneNbr: { contains: q } },
          { organisation: { contains: q } },
        ],
      }),
      filters: {
        shape: {
          kind: z.enum([CUSTOMER_KINDS.INDIVIDUAL, CUSTOMER_KINDS.CORPORATE]).optional(),
        },
        toWhere: (query) => {
          if (query.kind === CUSTOMER_KINDS.CORPORATE) return { corporate: CORPORATE_YES };
          if (query.kind === CUSTOMER_KINDS.INDIVIDUAL)
            return { OR: [{ corporate: null }, { NOT: { corporate: CORPORATE_YES } }] };
          return {};
        },
      },
      activeField: 'activeS',
      // No duplicate check on phone numbers: family members share one, as the stored data shows.
      stamps: LEGACY_STAMPS,
      createDefaults: async (tx) => ({ pharmacyId: await currentPharmacyId(tx, config) }),
    },
    { prisma, audit },
  );
}
