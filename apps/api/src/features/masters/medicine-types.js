import { POLICIES } from '@ihealth/shared/permissions';
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_SUBJECTS,
  activityEntrySchema,
  dataResponseSchema,
  medicineTypeBodySchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { toDbTime } from '#db';

import { defineRoute } from '../../http/define-route.js';
import { validationFailed } from '../../lib/errors.js';
import { createActivityLog } from '../activity/activity-log.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';

const RESOURCE = 'masters/items';

/**
 * Marking many items at once as prescription-only, controlled or antibiotic (the legacy schedule
 * code), so a pharmacist can go through the list without opening each item.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createMedicineTypeRoutes({ prisma, audit, config }) {
  const activity = createActivityLog(prisma);

  return [
    defineRoute({
      method: 'get',
      path: '/masters/items/medicine-type/history',
      summary: 'Recent medicine-type changes: which item, from what to what, who and when',
      description: 'Newest first.',
      tags: ['Masters'],
      permissions: POLICIES.masters.read,
      responses: {
        200: { description: 'History', schema: dataResponseSchema(z.array(activityEntrySchema)) },
      },
      handler: async () => ({
        data: await activity.latest(ACTIVITY_SUBJECTS.ITEM, {
          pharmacyId: null,
          limit: config.historyLimit,
        }),
      }),
    }),
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
        const employeeId = getAuth(res).employeeId;
        // Each item whose type really changes gets a line in its history: from what, to what.
        const count = await prisma.$transaction(async (tx) => {
          const before = await tx.items.findMany({
            where: { itemId: { in: itemIds } },
            select: { itemId: true, itemNm: true, scheduleCategoryCodeId: true },
          });
          const codes = new Map(
            (
              await tx.scheduleCategoryCode.findMany({
                where: {
                  scheduleCategoryCodeId: {
                    in: [
                      ...before.map((item) => item.scheduleCategoryCodeId),
                      scheduleCodeId,
                    ].filter((id) => id !== null),
                  },
                },
                select: { scheduleCategoryCodeId: true, scheduleCategoryCode: true },
              })
            ).map((code) => [
              code.scheduleCategoryCodeId,
              code.scheduleCategoryCode?.trim() ?? null,
            ]),
          );
          const { count: updated } = await tx.items.updateMany({
            where: { itemId: { in: itemIds } },
            data: {
              scheduleCategoryCodeId: scheduleCodeId,
              lastUpdateTs: toDbTime(),
              lastUpdateUserId: String(employeeId),
            },
          });
          for (const item of before.filter((row) => row.scheduleCategoryCodeId !== scheduleCodeId))
            await activity.record(
              {
                subjectType: ACTIVITY_SUBJECTS.ITEM,
                subjectId: item.itemId,
                action: ACTIVITY_ACTIONS.MEDICINE_TYPE_CHANGED,
                employeeId,
                details: {
                  itemName: item.itemNm?.trim() ?? null,
                  from: codes.get(item.scheduleCategoryCodeId ?? -1) ?? null,
                  to: scheduleCodeId === null ? null : (codes.get(scheduleCodeId) ?? null),
                },
              },
              tx,
            );
          return updated;
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
