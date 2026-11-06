import { POLICIES } from '@ihealth/shared/permissions';
import {
  activityEntrySchema,
  dataResponseSchema,
  salesSettingsInputSchema,
  salesSettingsSchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';
import { currentPharmacyId } from './current-pharmacy.js';
import { createPharmacySettings } from './pharmacy-settings.js';

const PATH = '/masters/sales-settings';
const RESOURCE = 'masters/sales-settings';
const TAGS = ['Masters'];

/**
 * The pharmacy's own choices about selling, kept on the Pharmacy profile screen.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createSalesSettingsRoutes({ prisma, audit, config }) {
  const settings = createPharmacySettings(prisma, config);
  return [
    defineRoute({
      method: 'get',
      path: PATH,
      summary: "The pharmacy's sales settings",
      tags: TAGS,
      permissions: POLICIES.masters.read,
      responses: {
        200: { description: 'Sales settings', schema: dataResponseSchema(salesSettingsSchema) },
      },
      handler: async () => ({
        data: await settings.sales(await currentPharmacyId(prisma, config)),
      }),
    }),

    defineRoute({
      method: 'get',
      path: `${PATH}/history`,
      summary: "Changes to the pharmacy's sales settings: who, when, from what to what",
      description: 'Newest first.',
      tags: TAGS,
      permissions: POLICIES.masters.read,
      responses: {
        200: { description: 'History', schema: dataResponseSchema(z.array(activityEntrySchema)) },
      },
      handler: async () => ({
        data: await settings.history(await currentPharmacyId(prisma, config)),
      }),
    }),

    defineRoute({
      method: 'put',
      path: PATH,
      summary: "Change the pharmacy's sales settings",
      description:
        '`controlledDrugRules` on: a controlled drug needs the register details before payment. Off: they are asked for, not required.',
      tags: TAGS,
      permissions: POLICIES.masters.write,
      request: { body: salesSettingsInputSchema },
      responses: {
        200: { description: 'The settings now', schema: dataResponseSchema(salesSettingsSchema) },
      },
      handler: async ({ req, res, input }) => {
        const pharmacyId = await currentPharmacyId(prisma, config);
        const before = await settings.sales(pharmacyId);
        await settings.saveSales(pharmacyId, input.body, getAuth(res).employeeId);
        await audit.record({
          action: `${RESOURCE}.update`,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          resourceType: RESOURCE,
          resourceId: pharmacyId,
          ipAddress: req.ip,
          details: { before, after: input.body },
        });
        return { data: await settings.sales(pharmacyId) };
      },
    }),
  ];
}
