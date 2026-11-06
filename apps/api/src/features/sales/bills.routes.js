/* eslint-disable jsdoc/reject-any-type -- list queries are typed by their Zod schema */
import { POLICIES } from '@ihealth/shared/permissions';
import {
  billDetailSchema,
  billListFiltersShape,
  billSummarySchema,
  cashierOptionSchema,
  completedSaleSchema,
  createListQuerySchema,
  dataResponseSchema,
  idParamsSchema,
  listResponseSchema,
  saleBodySchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { notFound } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';
import { currentPharmacyId } from '../masters/current-pharmacy.js';
import {
  BILL_SORTABLE,
  createBillsRepository,
  toBillDetail,
  toBillSummary,
} from './bills.repository.js';
import { createSaleService } from './complete-sale.js';
import { renderReceipt } from './receipt-pdf.js';

const PATH = '/sales/bills';
const TAGS = ['Sales'];
const RESOURCE = 'sales/bills';
const PRINT = 'print';
const REPRINT = 'reprint';

const receiptQuerySchema = z.object({
  /** Asks for the original receipt: given once, to the cashier who made the bill. */
  original: z.stringbool().optional(),
});

/** `YYYY-MM-DD HH:MM` in a time zone. */
const LOCAL_STAMP = 'sv-SE'; // hardcode-ok: a locale whose format is ISO-like, used only to build text

/**
 * @param {Date} date
 * @param {string} timeZone
 * @returns {string} The local date and time as `YYYY-MM-DD HH:MM`.
 */
const localStamp = (date, timeZone) =>
  new Intl.DateTimeFormat(LOCAL_STAMP, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  }).format(date);

/**
 * Past bills: the list with search and filters, one bill with its lines and payments, and its
 * receipt as a PDF. Reading a bill is audited: it carries customer and prescription details.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createSalesBillRoutes({ prisma, audit, config }) {
  const bills = createBillsRepository(prisma);
  const sales = createSaleService({ prisma, config });
  const listQuery = createListQuerySchema({
    sortable: BILL_SORTABLE,
    defaultSort: /** @type {any} */ ('-billDate'),
    filters: billListFiltersShape,
  });

  /**
   * @param {number} id
   * @param {number} pharmacyId
   * @returns {Promise<ReturnType<typeof toBillDetail>>}
   */
  const findOrFail = async (id, pharmacyId) => {
    const found = await bills.find(id, pharmacyId);
    if (!found) throw notFound('Bill not found');
    return toBillDetail(found);
  };

  /**
   * @param {import('express').Request} req
   * @param {string} action
   * @param {number} id
   * @returns {Promise<void>}
   */
  const record = (req, action, id) =>
    audit.record({
      action: `${RESOURCE}.${action}`,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      resourceType: RESOURCE,
      resourceId: id,
      ipAddress: req.ip,
    });

  /**
   * @param {number} id
   * @returns {Promise<boolean>} Whether the original receipt of this bill was printed already.
   */
  const printedBefore = async (id) => {
    /** @type {unknown[]} */
    const rows = await prisma.$queryRaw`
      SELECT 1 FROM ih_audit_log
      WHERE ACTION = ${`${RESOURCE}.${PRINT}`} AND RESOURCE_ID = ${String(id)} LIMIT 1`;
    return rows.length > 0;
  };

  return [
    defineRoute({
      method: 'get',
      path: PATH,
      summary: 'List past bills',
      description:
        'Newest first by default. `q` searches the bill number, customer name and phone.',
      tags: TAGS,
      permissions: POLICIES.sales.read,
      request: { query: listQuery },
      responses: {
        200: { description: 'A page of bills', schema: listResponseSchema(billSummarySchema) },
      },
      handler: async ({ input }) => {
        const query = /** @type {any} */ (input.query);
        const pharmacyId = await currentPharmacyId(prisma, config);
        const { rows, total } = await bills.list(query, pharmacyId);
        return {
          data: rows.map(toBillSummary),
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
      method: 'post',
      path: PATH,
      summary: 'Complete a sale',
      description:
        'Send the batches, quantities, discounts and payments; prices and totals are worked out here. ' +
        'Repeating a request with the same `requestKey` returns the bill already saved.',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { body: saleBodySchema },
      responses: {
        201: { description: 'The saved bill', schema: dataResponseSchema(completedSaleSchema) },
      },
      handler: async ({ req, res, input }) => {
        const pharmacyId = await currentPharmacyId(prisma, config);
        const { billId, change, repeated } = await sales.complete(/** @type {any} */ (input.body), {
          employeeId: getAuth(res).employeeId,
          pharmacyId,
          permissionIds: getAuth(res).permissionIds,
        });
        if (!repeated) await record(req, 'create', billId);
        return { data: { ...(await findOrFail(billId, pharmacyId)), change } };
      },
    }),

    defineRoute({
      method: 'get',
      path: `${PATH}/:id`,
      summary: 'Get one bill with its lines and payments',
      tags: TAGS,
      permissions: POLICIES.sales.read,
      request: { params: idParamsSchema },
      responses: { 200: { description: 'The bill', schema: dataResponseSchema(billDetailSchema) } },
      handler: async ({ req, input }) => {
        const bill = await findOrFail(input.params.id, await currentPharmacyId(prisma, config));
        await record(req, 'view', bill.id);
        return { data: bill };
      },
    }),

    defineRoute({
      method: 'get',
      path: `${PATH}/:id/receipt`,
      summary: "Print a bill's receipt (PDF)",
      description:
        'Marked "COPY", except the first print asked with `original=true` by the cashier who made the bill.',
      tags: TAGS,
      permissions: POLICIES.sales.read,
      request: { params: idParamsSchema, query: receiptQuerySchema },
      responses: { 200: { description: 'The receipt, application/pdf' } },
      handler: async ({ req, res, input }) => {
        const pharmacyId = await currentPharmacyId(prisma, config);
        const [bill, pharmacy, printer] = await Promise.all([
          findOrFail(input.params.id, pharmacyId),
          prisma.pharmacy.findUnique({
            where: { pharmacyId },
            select: {
              pharmacyNm: true,
              addressLine1: true,
              addressLine2: true,
              cityNm: true,
              phoneNbr: true,
              emailId: true,
              taxId: true,
            },
          }),
          prisma.employee.findUnique({
            where: { employeeId: getAuth(res).employeeId },
            select: { firstNm: true, lastNm: true },
          }),
        ]);
        const original =
          Boolean(input.query.original) &&
          bill.cashierId === getAuth(res).employeeId &&
          !(await printedBefore(bill.id));
        const pdf = await renderReceipt(bill, {
          pharmacy: {
            name: pharmacy?.pharmacyNm?.trim() ?? '',
            addressLines: [pharmacy?.addressLine1, pharmacy?.addressLine2, pharmacy?.cityNm]
              .map((part) => part?.trim())
              .filter((part) => /** @type {string} */ (part)?.length > 0)
              .map(String),
            phone: pharmacy?.phoneNbr?.trim() || null,
            email: pharmacy?.emailId?.trim() || null,
            taxPin: pharmacy?.taxId?.trim() || null,
          },
          region: config.region,
          printedBy: [printer?.firstNm, printer?.lastNm].filter(Boolean).join(' ').trim(),
          printedAt: localStamp(new Date(), config.region.timeZone),
          copy: !original,
        });
        await record(req, original ? PRINT : REPRINT, bill.id);
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="receipt-${encodeURIComponent(bill.code ?? String(bill.id))}.pdf"`,
          'Cache-Control': 'no-store',
        });
        res.status(200).end(pdf);
      },
    }),

    defineRoute({
      method: 'get',
      path: '/sales/cashiers',
      summary: 'People who have made bills, for the cashier filter',
      tags: TAGS,
      permissions: POLICIES.sales.read,
      responses: {
        200: { description: 'Cashiers', schema: dataResponseSchema(z.array(cashierOptionSchema)) },
      },
      handler: async () => ({
        data: await bills.cashiers(await currentPharmacyId(prisma, config)),
      }),
    }),
  ];
}
