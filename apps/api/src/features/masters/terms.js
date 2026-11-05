import { POLICIES } from '@ihealth/shared/permissions';
import { termsInputSchema, termsSchema } from '@ihealth/shared/schemas';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { columnMapping, LEGACY_STAMPS } from './legacy-mapping.js';

const COLUMNS = Object.freeze({ text: 'termsAndConditions' });

/**
 * Terms and conditions printed on quotations, invoices and orders.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog }} deps
 * @returns The terms routes.
 */
export function createTermsRoutes(deps) {
  return createCrudRoutes(
    {
      resource: 'masters/terms',
      label: 'Terms and conditions',
      tag: 'Masters',
      delegate: (prisma) => prisma.companyTermsAndConditions,
      idField: 'companyTermsAndConditionsId',
      permissions: POLICIES.masters,
      itemSchema: termsSchema,
      inputSchema: termsInputSchema,
      ...columnMapping('companyTermsAndConditionsId', COLUMNS, ['text']),
      sortable: ['id'],
      sortColumns: { id: 'companyTermsAndConditionsId' },
      defaultSort: '-id',
      search: (q) => ({ termsAndConditions: { contains: q } }),
      activeField: 'activeS',
      stamps: LEGACY_STAMPS,
    },
    deps,
  );
}
