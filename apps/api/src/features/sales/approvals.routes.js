/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy stock */
import { POLICIES } from '@ihealth/shared/permissions';
import { priceBill } from '@ihealth/shared/pricing';
import {
  approvalReportQuerySchema,
  billApprovalSchema,
  cancelBillBodySchema,
  dataResponseSchema,
  idParamsSchema,
  saleApprovalBodySchema,
  saleApprovalSchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { validationFailed } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';
import { currentPharmacyId } from '../masters/current-pharmacy.js';
import { approvalsNeeded, createApprovalService, linesHash } from './approvals.js';
import { createApprovalsRepository } from './approvals.repository.js';
import { loadBatches, todayIn } from './batches.repository.js';
import { createCancelService } from './cancel-bill.js';

const TAGS = ['Sales'];

/**
 * Approvals: a second person approving a sale's lines or a cancellation, and the daily report.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createApprovalRoutes({ prisma, audit, config }) {
  const approvals = createApprovalService({ prisma, config });
  const cancels = createCancelService({ prisma, config });
  const repository = createApprovalsRepository(prisma);

  /**
   * @param {import('express').Request} req
   * @param {string} action
   * @param {number | string} resourceId
   * @param {Record<string, unknown>} details
   * @returns {Promise<void>}
   */
  const record = (req, action, resourceId, details) =>
    audit.record({
      action,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      resourceType: 'sales/approvals',
      resourceId,
      ipAddress: req.ip,
      details,
    });

  return [
    defineRoute({
      method: 'post',
      path: '/sales/approvals',
      summary: 'A second person approves what on a sale the cashier may not do alone',
      description:
        "Send the lines as they will be sold, a reason, and the approver's username and PIN. " +
        'The answer is a token to send with the sale; it fits only these lines, once, for a short time.',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { body: saleApprovalBodySchema },
      responses: {
        201: { description: 'The approval', schema: dataResponseSchema(saleApprovalSchema) },
      },
      handler: async ({ req, res, input }) => {
        const body = /** @type {any} */ (input.body);
        const actor = {
          employeeId: getAuth(res).employeeId,
          pharmacyId: await currentPharmacyId(prisma, config),
        };
        const batches = await loadBatches(
          prisma,
          [...new Set(body.lines.map((/** @type {any} */ line) => line.stockId))],
          actor.pharmacyId,
        );
        const priced = priceBill(
          body.lines.map((/** @type {any} */ line) => {
            const batch = batches.get(line.stockId) ?? {};
            return {
              labelPrice: line.labelPrice ?? Number(batch.labelPrice ?? 0),
              quantity: line.quantity,
              discountPercent: line.discountPercent,
              vatPercent: Number(batch.vatPercent ?? 0),
              unitCost:
                batch.unitCost === null || batch.unitCost === undefined
                  ? null
                  : Number(batch.unitCost),
              costDiscountPercent: Number(batch.costDiscountPercent ?? 0),
            };
          }),
          { roundingStep: config.sales.roundingStep },
        );
        const items = approvalsNeeded(
          body.lines,
          batches,
          priced.lines,
          config.sales.selfDiscountLimit,
        );
        if (!items.some((item) => item.reasons.length))
          throw validationFailed([
            { path: 'body.lines', message: 'Nothing on this sale needs approval' },
          ]);
        const approver = await approvals.verifyApprover(body, {
          requesterId: actor.employeeId,
          own: 'sale',
        });
        const approval = await approvals.recordSaleApproval(
          { items, hash: linesHash(body.lines), reason: body.reason, approver },
          actor,
        );
        await record(req, 'sales/approvals.grant', approval.token, {
          approvedBy: approver.employeeId,
          givenAway: approval.givenAway,
        });
        return { data: approval };
      },
    }),

    defineRoute({
      method: 'post',
      path: '/sales/bills/:id/cancel',
      summary: 'Cancel a bill of today',
      description:
        'Its cashier may cancel it alone for a few minutes after the sale; otherwise a second ' +
        'person with "Sales approval" enters their username and PIN. Items go back to stock and ' +
        'the cash comes out of the till (legacy triggers).',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { params: idParamsSchema, body: cancelBillBodySchema },
      responses: { 204: { description: 'Cancelled' } },
      handler: async ({ req, res, input }) => {
        const actor = {
          employeeId: getAuth(res).employeeId,
          pharmacyId: await currentPharmacyId(prisma, config),
        };
        const { approvedBy } = await cancels.cancel(
          input.params.id,
          /** @type {any} */ (input.body),
          actor,
        );
        await audit.record({
          action: 'sales/bills.cancel',
          outcome: AUDIT_OUTCOMES.SUCCESS,
          resourceType: 'sales/bills',
          resourceId: input.params.id,
          ipAddress: req.ip,
          details: { withApproval: approvedBy !== null },
        });
      },
    }),

    defineRoute({
      method: 'get',
      path: '/sales/approvals',
      summary: 'Approvals of one day: who asked, who approved, why, and how much',
      tags: TAGS,
      permissions: POLICIES.sales.approve,
      request: { query: approvalReportQuerySchema },
      responses: {
        200: {
          description: 'Approvals, newest first',
          schema: dataResponseSchema(z.array(billApprovalSchema)),
        },
      },
      handler: async ({ input }) => ({
        data: await repository.ofDay(
          await currentPharmacyId(prisma, config),
          input.query.date ?? todayIn(config.region.timeZone),
        ),
      }),
    }),
  ];
}
