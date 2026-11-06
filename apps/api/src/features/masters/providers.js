/* eslint-disable jsdoc/reject-any-type -- items come from the generic CRUD factory */
import { POLICIES } from '@ihealth/shared/permissions';
import { providerInputSchema, providerSchema } from '@ihealth/shared/schemas';

import { fromDbTime } from '#db';

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
  /** @type {{ providerId: number, creationUserId: string | null, creationTs: Date | null }[]} */
  const stamps = items.length
    ? await prisma.provider.findMany({
        where: { providerId: { in: items.map((item) => item.id) } },
        select: { providerId: true, creationUserId: true, creationTs: true },
      })
    : [];
  // The new system writes the employee's id; older rows may hold a name, shown as written.
  const employeeIds = [
    ...new Set(
      stamps
        .map((row) => Number(row.creationUserId))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const employees = employeeIds.length
    ? await prisma.employee.findMany({
        where: { employeeId: { in: employeeIds } },
        select: { employeeId: true, firstNm: true, lastNm: true },
      })
    : [];
  const employeeNames = new Map(
    employees.map((/** @type {any} */ row) => [
      row.employeeId,
      [row.firstNm, row.lastNm]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(' ') || null,
    ]),
  );
  const added = new Map(
    stamps.map((row) => [
      row.providerId,
      {
        addedBy: employeeNames.get(Number(row.creationUserId)) ?? text(row.creationUserId),
        addedAt: row.creationTs ? fromDbTime(row.creationTs).toISOString() : null,
      },
    ]),
  );
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
    addedBy: added.get(item.id)?.addedBy ?? null,
    addedAt: added.get(item.id)?.addedAt ?? null,
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
