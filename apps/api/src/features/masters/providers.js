/* eslint-disable jsdoc/reject-any-type -- items come from the generic CRUD factory */
import { POLICIES } from '@ihealth/shared/permissions';
import { providerInputSchema, providerSchema } from '@ihealth/shared/schemas';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { ADDRESS_COLUMNS, columnMapping, LEGACY_STAMPS, text } from './legacy-mapping.js';

/** API field -> `provider` column (Prisma field). DOB is not offered: legacy dates may be zero dates. */
const COLUMNS = Object.freeze({
  firstName: 'firstNm',
  middleName: 'middleNm',
  lastName: 'lastNm',
  gender: 'genderCd',
  licenseNumber: 'licenseNumber',
  providerTypeId: 'providerTypeLookupId',
  speciality: 'speciality',
  hospitalId: 'hospitalId',
  phone: 'phoneNbr',
  email: 'emailId',
  ...ADDRESS_COLUMNS,
});

/**
 * Adds the names of each provider's hospital and type (no foreign keys, so no Prisma relations).
 *
 * @param {Record<string, any>[]} items
 * @param {any} prisma
 * @returns {Promise<Record<string, any>[]>}
 */
async function withNames(items, prisma) {
  const hospitalIds = [...new Set(items.map((item) => item.hospitalId).filter(Boolean))];
  const typeIds = [...new Set(items.map((item) => item.providerTypeId).filter(Boolean))];
  const [hospitals, types] = await Promise.all([
    hospitalIds.length
      ? prisma.hospital.findMany({
          where: { hospitalId: { in: hospitalIds } },
          select: { hospitalId: true, name: true },
        })
      : [],
    typeIds.length
      ? prisma.providerTypeLookup.findMany({
          where: { providerTypeLookupId: { in: typeIds } },
          select: { providerTypeLookupId: true, providerTypeDesc: true },
        })
      : [],
  ]);
  const hospitalNames = new Map(
    hospitals.map((/** @type {any} */ row) => [row.hospitalId, text(row.name)]),
  );
  const typeNames = new Map(
    types.map((/** @type {any} */ row) => [row.providerTypeLookupId, text(row.providerTypeDesc)]),
  );
  return items.map((item) => ({
    ...item,
    gender: item.gender?.toUpperCase() ?? null,
    hospitalName: hospitalNames.get(item.hospitalId) ?? null,
    providerTypeName: typeNames.get(item.providerTypeId) ?? null,
  }));
}

/**
 * Prescribers (doctors, clinical officers, ...) named on prescriptions.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog }} deps
 * @returns The provider routes.
 */
export function createProviderRoutes(deps) {
  return createCrudRoutes(
    {
      resource: 'masters/providers',
      label: 'Provider',
      tag: 'Masters',
      delegate: (prisma) => prisma.provider,
      idField: 'providerId',
      permissions: POLICIES.masters,
      itemSchema: providerSchema,
      inputSchema: providerInputSchema,
      ...columnMapping('providerId', COLUMNS, ['firstName', 'lastName']),
      enrich: withNames,
      sortable: ['lastName', 'firstName', 'licenseNumber'],
      sortColumns: { lastName: 'lastNm', firstName: 'firstNm', licenseNumber: 'licenseNumber' },
      defaultSort: 'lastName',
      search: (q) => ({
        OR: [
          { firstNm: { contains: q } },
          { lastNm: { contains: q } },
          { licenseNumber: { contains: q } },
        ],
      }),
      activeField: 'activeS',
      unique: [
        {
          field: 'licenseNumber',
          where: (input) => (input.licenseNumber ? { licenseNumber: input.licenseNumber } : null),
          message: 'A provider with this licence number already exists',
        },
      ],
      stamps: LEGACY_STAMPS,
    },
    deps,
  );
}
