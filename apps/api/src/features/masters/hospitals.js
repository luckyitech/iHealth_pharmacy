import { POLICIES } from '@ihealth/shared/permissions';
import { hospitalInputSchema, hospitalSchema } from '@ihealth/shared/schemas';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { ADDRESS_COLUMNS, columnMapping, LEGACY_STAMPS } from './legacy-mapping.js';

/** API field -> `hospital` column (Prisma field). */
const COLUMNS = Object.freeze({
  name: 'name',
  license: 'license',
  phone: 'phoneNbr',
  contactNumber: 'contactNbr',
  helpline: 'helpline',
  email: 'emailId',
  fax: 'fax',
  website: 'website',
  ...ADDRESS_COLUMNS,
});

/**
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog }} deps
 * @returns The hospital routes.
 */
export function createHospitalRoutes(deps) {
  return createCrudRoutes(
    {
      resource: 'masters/hospitals',
      label: 'Hospital',
      tag: 'Masters',
      delegate: (prisma) => prisma.hospital,
      idField: 'hospitalId',
      permissions: POLICIES.masters,
      itemSchema: hospitalSchema,
      inputSchema: hospitalInputSchema,
      ...columnMapping('hospitalId', COLUMNS, ['name']),
      sortable: ['name', 'city'],
      sortColumns: { name: 'name', city: 'cityNm' },
      defaultSort: 'name',
      search: (q) => ({
        OR: [{ name: { contains: q } }, { cityNm: { contains: q } }, { license: { contains: q } }],
      }),
      activeField: 'activeS',
      unique: [
        {
          field: 'name',
          where: (input) => (input.name ? { name: input.name } : null),
          message: 'A hospital with this name already exists',
        },
      ],
      stamps: LEGACY_STAMPS,
    },
    deps,
  );
}
