import { POLICIES } from '@ihealth/shared/permissions';
import { dataResponseSchema, medicineTypeBodySchema } from '@ihealth/shared/schemas';
import { z } from 'zod';

import { toDbTime } from '#db';

import { defineRoute } from '../../http/define-route.js';
import { validationFailed } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';

const RESOURCE = 'masters/items';

/**
 * Marking many items at once as prescription-only, controlled or antibiotic (the legacy schedule
 * code), so a pharmacist can go through the list without opening each item.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog }} deps
 * @returns The routes.
 */
export function createMedicineTypeRoutes({ prisma, audit }) {
  return [
    defineRoute({
      method: 'post',
      path: '/masters/items/medicine-type',
      summary: 'Set the medicine type of several items',
      description:
        '`scheduleCodeId` is a schedule code from /lookups/schedule-codes; null clears it.',
      tags: ['Masters'],
      permissions: POLICIES.masters.write,
      request: { body: medicineTypeBodySchema },
      responses: {
        200: {
          description: 'How many items changed',
          schema: dataResponseSchema(z.object({ updated: z.number().int() })),
        },
      },
      handler: async ({ req, res, input }) => {
        const { itemIds, scheduleCodeId } = input.body;
        if (scheduleCodeId !== null) {
          const code = await prisma.scheduleCategoryCode.findUnique({
            where: { scheduleCategoryCodeId: scheduleCodeId },
            select: { activeS: true },
          });
          if (!code || code.activeS?.toUpperCase() === 'N')
            throw validationFailed([
              { path: 'body.scheduleCodeId', message: 'Choose a type from the list' },
            ]);
        }
        const { count } = await prisma.items.updateMany({
          where: { itemId: { in: itemIds } },
          data: {
            scheduleCategoryCodeId: scheduleCodeId,
            lastUpdateTs: toDbTime(),
            lastUpdateUserId: String(getAuth(res).employeeId),
          },
        });
        await audit.record({
          action: `${RESOURCE}.medicine-type`,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          resourceType: RESOURCE,
          ipAddress: req.ip,
          details: { itemIds, scheduleCodeId, updated: count },
        });
        return { data: { updated: count } };
      },
    }),
  ];
}
