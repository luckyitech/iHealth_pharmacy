import { POLICIES } from '@ihealth/shared/permissions';
import {
  completedReturnSchema,
  dataResponseSchema,
  idParamsSchema,
  returnableBillSchema,
  returnBodySchema,
  returnDayQuerySchema,
  returnSummarySchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { notFound } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';
import { currentPharmacyId } from '../masters/current-pharmacy.js';
import { renderReturnReceipt } from './return-receipt-pdf.js';
import { createReturnService } from './returns.js';
import { createReturnsRepository } from './returns.repository.js';

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
  const lists = createReturnsRepository(prisma);
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
      summary: "A day's returns, the legacy app's included",
      tags: TAGS,
      permissions: POLICIES.sales.read,
      request: { query: returnDayQuerySchema },
      responses: {
        200: { description: 'Returns', schema: dataResponseSchema(z.array(returnSummarySchema)) },
      },
      handler: async ({ input }) => ({
        data: await lists.ofDay(input.query.date, await currentPharmacyId(prisma, config)),
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
