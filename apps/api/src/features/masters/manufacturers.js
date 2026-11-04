/* eslint-disable jsdoc/reject-any-type -- rows come from the generic CRUD factory, typed by SELECT */
import { POLICIES } from '@ihealth/shared/permissions';
import { manufacturerInputSchema, manufacturerSchema } from '@ihealth/shared/schemas';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { isActive, isoDate, LEGACY_STAMPS, pickColumns, text } from './legacy-mapping.js';

/** API field -> `manufacturer` column (Prisma field). */
const COLUMNS = Object.freeze({
  name: 'mfrName',
  license: 'license',
  phone: 'phoneNbr',
  email: 'emailId',
  fax: 'fax',
  website: 'website',
  contactFirstName: 'contactPersonFirstNm',
  contactLastName: 'contactPersonLastNm',
  contactPhone: 'contactPersonPhoneNbr',
  contactEmail: 'contactPersonEmailId',
  addressLine1: 'addressLine1',
  addressLine2: 'addressLine2',
  city: 'cityNm',
  zip: 'zipCd',
  countryId: 'countryId',
  provinceId: 'provincesId',
});

const SELECT = Object.freeze({
  manufacturerId: true,
  activeS: true,
  lastUpdateTs: true,
  ...Object.fromEntries(Object.values(COLUMNS).map((column) => [column, true])),
});

/**
 * @param {Record<string, any>} row A `manufacturer` row as selected by SELECT.
 * @returns {import('@ihealth/shared/schemas').Manufacturer}
 */
function toItem(row) {
  return {
    id: row.manufacturerId,
    active: isActive(row.activeS),
    updatedAt: isoDate(row.lastUpdateTs),
    name: text(row.mfrName) ?? '',
    license: text(row.license),
    phone: text(row.phoneNbr),
    email: text(row.emailId),
    fax: text(row.fax),
    website: text(row.website),
    contactFirstName: text(row.contactPersonFirstNm),
    contactLastName: text(row.contactPersonLastNm),
    contactPhone: text(row.contactPersonPhoneNbr),
    contactEmail: text(row.contactPersonEmailId),
    addressLine1: text(row.addressLine1),
    addressLine2: text(row.addressLine2),
    city: text(row.cityNm),
    zip: text(row.zipCd),
    countryId: row.countryId ?? null,
    provinceId: row.provincesId ?? null,
  };
}

/**
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog }} deps
 * @returns The manufacturer routes.
 */
export function createManufacturerRoutes(deps) {
  return createCrudRoutes(
    {
      resource: 'masters/manufacturers',
      label: 'Manufacturer',
      tag: 'Masters',
      delegate: (prisma) => prisma.manufacturer,
      idField: 'manufacturerId',
      permissions: POLICIES.masters,
      itemSchema: manufacturerSchema,
      inputSchema: manufacturerInputSchema,
      select: SELECT,
      toItem,
      toData: (input) => pickColumns(input, COLUMNS),
      sortable: ['name', 'city', 'updatedAt'],
      sortColumns: { name: 'mfrName', city: 'cityNm', updatedAt: 'lastUpdateTs' },
      defaultSort: 'name',
      search: (q) => ({
        OR: [
          { mfrName: { contains: q } },
          { license: { contains: q } },
          { cityNm: { contains: q } },
        ],
      }),
      activeField: 'activeS',
      unique: [
        {
          field: 'name',
          where: (input) => (input.name ? { mfrName: input.name } : null),
          message: 'A manufacturer with this name already exists',
        },
      ],
      stamps: LEGACY_STAMPS,
    },
    deps,
  );
}
