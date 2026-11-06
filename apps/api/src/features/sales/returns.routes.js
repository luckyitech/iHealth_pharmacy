/* eslint-disable jsdoc/reject-any-type -- list queries are typed by their Zod schema */
import { POLICIES } from '@ihealth/shared/permissions';
import {
  ACTIVITY_ACTIONS,
  cashierOptionSchema,
  createListQuerySchema,
  listResponseSchema,
  ACTIVITY_SUBJECTS,
  completedReturnSchema,
  dataResponseSchema,
  idParamsSchema,
  returnableBillSchema,
  returnBodySchema,
  returnListFiltersShape,
  returnSummarySchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { notFound } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';
import { createActivityLog } from '../activity/activity-log.js';
import { currentPharmacyId } from '../masters/current-pharmacy.js';
import { renderReturnReceipt } from './return-receipt-pdf.js';
import { createReturnService } from './returns.js';
import { createReturnsRepository, RETURN_SORTABLE } from './returns.repository.js';

const TAGS = ['Sales'];
const RESOURCE = 'sales/returns';

/**
 * Sales returns: what a bill can still return, returning it with a second person's approval, and
 * the return receipt (with the credit note when the money went back as one).
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createReturnRoutes({ prisma, audit, config }) {
  const returns = createReturnService({ prisma, config });
  const activity = createActivityLog(prisma);
  const lists = createReturnsRepository(prisma);
  const listQuery = createListQuerySchema({
    sortable: RETURN_SORTABLE,
    defaultSort: /** @type {any} */ ('-at'),
    filters: returnListFiltersShape,
  });
  const money = new Intl.NumberFormat(config.region.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const dateTimes = new Intl.DateTimeFormat(config.region.locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
  const dates = new Intl.DateTimeFormat(config.region.locale, {
    dateStyle: 'short',
    timeZone: 'UTC',
  });

  /**
   * @param {number} id
   * @param {number} pharmacyId
   * @returns {Promise<NonNullable<Awaited<ReturnType<typeof returns.read>>>>}
   */
  const readOrFail = async (id, pharmacyId) => {
    const found = await returns.read(id, pharmacyId);
    if (!found) throw notFound('Return not found');
    return found;
  };

  return [
    defineRoute({
      method: 'get',
      path: '/sales/returns',
      summary: "Returns, newest first, the legacy app's included",
      description:
        "`q` searches the return and bill numbers and the customer's name and phone. Filters: `from`, `to`, `refundMethod`, `approverId`.",
      tags: TAGS,
      permissions: POLICIES.sales.read,
      request: { query: listQuery },
      responses: {
        200: { description: 'A page of returns', schema: listResponseSchema(returnSummarySchema) },
      },
      handler: async ({ input }) => {
        const query = /** @type {any} */ (input.query);
        const { rows, total } = await lists.list(query, await currentPharmacyId(prisma, config));
        return {
          data: rows,
          meta: {
            page: query.page,
            pageSize: query.pageSize,
            total,
            totalPages: Math.ceil(total / query.pageSize),
          },
        };
      },
    }),

    defineRoute({
      method: 'get',
      path: '/sales/returns/approvers',
      summary: 'People who have approved returns, for the approver filter',
      tags: TAGS,
      permissions: POLICIES.sales.read,
      responses: {
        200: { description: 'Approvers', schema: dataResponseSchema(z.array(cashierOptionSchema)) },
      },
      handler: async () => ({
        data: await lists.approvers(await currentPharmacyId(prisma, config)),
      }),
    }),

    defineRoute({
      method: 'get',
      path: '/sales/bills/:id/returnable',
      summary: 'What can still be returned from a bill, and what each unit gives back',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { params: idParamsSchema },
      responses: {
        200: { description: 'The bill', schema: dataResponseSchema(returnableBillSchema) },
      },
      handler: async ({ input }) => ({
        data: await returns.returnable(input.params.id, await currentPharmacyId(prisma, config)),
      }),
    }),

    defineRoute({
      method: 'post',
      path: '/sales/bills/:id/returns',
      summary: 'Return goods from a bill, approved by a second person',
      description:
        'The refund is worked out from what was paid. Units go back to the batch they were sold from, or are written off.',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { params: idParamsSchema, body: returnBodySchema },
      responses: {
        201: { description: 'The return', schema: dataResponseSchema(completedReturnSchema) },
      },
      handler: async ({ req, res, input }) => {
        const pharmacyId = await currentPharmacyId(prisma, config);
        const { returnId } = await returns.create(
          input.params.id,
          /** @type {Parameters<typeof returns.create>[1]} */ (input.body),
          { employeeId: getAuth(res).employeeId, pharmacyId },
        );
        await audit.record({
          action: `${RESOURCE}.create`,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          resourceType: RESOURCE,
          resourceId: returnId,
          ipAddress: req.ip,
          details: { billId: input.params.id },
        });
        const detail = await readOrFail(returnId, pharmacyId);
        return {
          data: {
            id: detail.id,
            code: detail.code,
            billId: detail.billId,
            billCode: detail.billCode,
            refund: detail.refund,
            refundMethod: detail.refundMethod,
            approvedBy: detail.approvedBy,
            creditNote: detail.creditNote,
          },
        };
      },
    }),

    defineRoute({
      method: 'get',
      path: '/sales/returns/:id/receipt',
      summary: "A return's receipt, with its credit note (PDF)",
      tags: TAGS,
      permissions: POLICIES.sales.read,
      request: { params: idParamsSchema },
      responses: { 200: { description: 'The receipt, application/pdf' } },
      handler: async ({ req, res, input }) => {
        const pharmacyId = await currentPharmacyId(prisma, config);
        const [detail, pharmacy] = await Promise.all([
          readOrFail(input.params.id, pharmacyId),
          prisma.pharmacy.findUnique({
            where: { pharmacyId },
            select: { pharmacyNm: true, addressLine1: true, addressLine2: true, cityNm: true },
          }),
        ]);
        const pdf = await renderReturnReceipt(detail, {
          pharmacy: {
            name: pharmacy?.pharmacyNm?.trim() ?? '',
            addressLines: [pharmacy?.addressLine1, pharmacy?.addressLine2, pharmacy?.cityNm]
              .map((part) => part?.trim() ?? '')
              .filter(Boolean),
          },
          formatMoney: (value) => money.format(Number(value)),
          formatDateTime: (value) =>
            dateTimes.format(new Date(`${value.slice(0, 19).replace(' ', 'T')}Z`)),
          formatDate: (value) => dates.format(new Date(`${value}T00:00:00Z`)),
        });
        await audit.record({
          action: `${RESOURCE}.print`,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          resourceType: RESOURCE,
          resourceId: detail.id,
          ipAddress: req.ip,
        });
        // On the returned bill's history, so the bill shows every paper it produced.
        /** @type {unknown[]} */
        const before = await prisma.$queryRaw`
          SELECT 1 FROM ih_activity
          WHERE SUBJECT_TYPE = ${ACTIVITY_SUBJECTS.BILL} AND SUBJECT_ID = ${String(detail.billId)}
            AND ACTION = ${ACTIVITY_ACTIONS.RETURN_RECEIPT_PRINTED}
            AND JSON_EXTRACT(DETAILS, '$.returnId') = ${detail.id} LIMIT 1`;
        await activity.record({
          subjectType: ACTIVITY_SUBJECTS.BILL,
          subjectId: detail.billId,
          action: before.length
            ? ACTIVITY_ACTIONS.RETURN_RECEIPT_REPRINTED
            : ACTIVITY_ACTIONS.RETURN_RECEIPT_PRINTED,
          employeeId: getAuth(res).employeeId,
          pharmacyId,
          details: { returnId: detail.id, code: detail.code },
        });
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="return-${encodeURIComponent(detail.code)}.pdf"`,
          'Cache-Control': 'no-store',
        });
        res.status(200).end(pdf);
      },
    }),
  ];
}
