import { POLICIES } from '@ihealth/shared/permissions';
import { manufacturerInputSchema, manufacturerSchema } from '@ihealth/shared/schemas';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { ADDRESS_COLUMNS, columnMapping, LEGACY_STAMPS } from './legacy-mapping.js';

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
  ...ADDRESS_COLUMNS,
});

const MAPPING = columnMapping('manufacturerId', COLUMNS, ['name']);

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
      ...MAPPING,
      sortable: ['name', 'city'],
      sortColumns: { name: 'mfrName', city: 'cityNm' },
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
