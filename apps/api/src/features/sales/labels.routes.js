/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy and additive tables */
import { randomUUID } from 'node:crypto';

import { POLICIES } from '@ihealth/shared/permissions';
import {
  billLabelsSchema,
  dataResponseSchema,
  idParamsSchema,
  printLabelsBodySchema,
} from '@ihealth/shared/schemas';

import { defineRoute } from '../../http/define-route.js';
import { notFound, validationFailed } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';
import { currentPharmacyId } from '../masters/current-pharmacy.js';
import { batchExpiry } from './batches.repository.js';
import { renderLabels } from './labels-pdf.js';
import { medicineKindOf } from './medicine-types.js';
import { createReceiptSettings } from './receipt-settings.js';

const TAGS = ['Sales'];
const BILLS = '/sales/bills';
const RESOURCE = 'sales/bills';
const ACTIVE = 'Y';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const textOrNull = (value) => String(value ?? '').trim() || null;

/**
 * Dosing stickers for a bill's medicines: the lines with what to print, printing (which keeps what
 * was printed) and reprinting the same.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createLabelRoutes({ prisma, audit, config }) {
  const settings = createReceiptSettings(prisma);
  const dates = new Intl.DateTimeFormat(config.region.locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const months = new Intl.DateTimeFormat(config.region.locale, {
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });

  /**
   * @param {number} billId
   * @param {number} pharmacyId
   * @returns {Promise<{ bill: Record<string, any>, lines: Record<string, any>[] }>}
   */
  const readBill = async (billId, pharmacyId) => {
    /** @type {Record<string, any>[]} */
    const [bill] = await prisma.$queryRaw`
      SELECT BILL_ID AS id, BILL_CODE AS code, CUSTOMER_NM AS customerName,
        CAST(BILL_DATE AS CHAR) AS billDate
      FROM sales WHERE BILL_ID = ${billId} AND PHARMACY_ID = ${pharmacyId}`;
    if (!bill) throw notFound('Bill not found');
    /** @type {Record<string, any>[]} */
    const lines = await prisma.$queryRaw`
      SELECT i.SALES_ITEMS_ID AS lineId, it.ITEM_NM AS itemName,
        COALESCE(i.BATCH_NO, st.BATCH_NO) AS batchNo, CAST(st.EXPIRY_DT AS CHAR) AS expiryDate,
        i.SALE_QTY AS quantity, sc.SCHEDULE_CATEGORY_CODE AS scheduleCode,
        (SELECT fi.INSTRUCTIONS FROM formulation_instructions fi
          WHERE fi.ITEM_ID = i.ITEM_ID AND fi.ACTIVE_S = ${ACTIVE}
          ORDER BY fi.FORMULATION_INSTRUCTION_ID DESC LIMIT 1) AS suggestedText
      FROM sales_items i
        LEFT JOIN items it ON it.ITEM_ID = i.ITEM_ID
        LEFT JOIN stock st ON st.STOCK_ID = i.STOCK_ID
        LEFT JOIN schedule_category_code sc ON sc.SCHEDULE_CATEGORY_CODE_ID = it.SCHEDULE_CATEGORY_CODE_ID
      WHERE i.BILL_ID = ${billId}
      ORDER BY i.SALES_ITEMS_ID`;
    return { bill, lines };
  };

  /**
   * @param {number} billId
   * @returns {Promise<Map<number, { text: string, copies: number }>>} The last print, by line.
   */
  const lastPrint = async (billId) => {
    /** @type {Record<string, any>[]} */
    const rows = await prisma.$queryRaw`
      SELECT SALES_ITEMS_ID AS lineId, LABEL_TEXT AS text, COPIES AS copies
      FROM ih_dispense_label
      WHERE PRINT_ID = (SELECT PRINT_ID FROM ih_dispense_label WHERE BILL_ID = ${billId}
        ORDER BY PRINTED_AT DESC, LABEL_ID DESC LIMIT 1)`;
    return new Map(
      rows.map((row) => [
        Number(row.lineId),
        { text: String(row.text), copies: Number(row.copies) },
      ]),
    );
  };

  /**
   * @param {Record<string, any>} bill
   * @param {Record<string, any>[]} lines
   * @param {Map<number, { text: string, copies: number }>} labels
   * @returns {Promise<Buffer>}
   */
  const pdfOf = async (bill, lines, labels) => {
    const layout = await settings.labelLayout();
    const stickers = lines
      .filter((line) => (labels.get(Number(line.lineId))?.copies ?? 0) > 0)
      .map((line) => {
        const label = /** @type {{ text: string, copies: number }} */ (
          labels.get(Number(line.lineId))
        );
        const expiry = batchExpiry(line.expiryDate);
        return {
          itemName: textOrNull(line.itemName) ?? '',
          text: label.text,
          copies: label.copies,
          expiry: expiry ? months.format(new Date(`${expiry}T00:00:00Z`)) : null,
          medicineKind: medicineKindOf(config.medicine.types, line.scheduleCode),
        };
      });
    const billDate = batchExpiry(bill.billDate);
    return renderLabels(stickers, {
      header: layout.header,
      footer: layout.footer.length ? layout.footer : [config.labels.warning],
      patientName: textOrNull(bill.customerName),
      dispensedOn: billDate ? dates.format(new Date(`${billDate}T00:00:00Z`)) : '',
    });
  };

  /**
   * @param {import('express').Response} res
   * @param {Buffer} pdf
   * @param {number} billId
   * @returns {void}
   */
  const sendPdf = (res, pdf, billId) => {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="labels-${billId}.pdf"`,
      'Cache-Control': 'no-store',
    });
    res.status(200).end(pdf);
  };

  /**
   * @param {import('express').Request} req
   * @param {string} action
   * @param {number} billId
   * @returns {Promise<void>}
   */
  const record = (req, action, billId) =>
    audit.record({
      action: `${RESOURCE}.${action}`,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      resourceType: RESOURCE,
      resourceId: billId,
      ipAddress: req.ip,
    });

  return [
    defineRoute({
      method: 'get',
      path: `${BILLS}/:id/labels`,
      summary: "A bill's lines, ready for their dosing stickers",
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { params: idParamsSchema },
      responses: {
        200: { description: 'The lines', schema: dataResponseSchema(billLabelsSchema) },
      },
      handler: async ({ input }) => {
        const { bill, lines } = await readBill(
          input.params.id,
          await currentPharmacyId(prisma, config),
        );
        const saved = await lastPrint(input.params.id);
        return {
          data: {
            billId: Number(bill.id),
            billCode: textOrNull(bill.code),
            printedBefore: saved.size > 0,
            lines: lines.map((line) => ({
              lineId: Number(line.lineId),
              itemName: textOrNull(line.itemName),
              batchNo: textOrNull(line.batchNo),
              expiryDate: batchExpiry(line.expiryDate),
              quantity: Number(line.quantity ?? 0),
              medicineKind: /** @type {any} */ (
                medicineKindOf(config.medicine.types, line.scheduleCode)
              ),
              suggestedText: textOrNull(line.suggestedText),
              savedText: saved.get(Number(line.lineId))?.text ?? null,
              savedCopies: saved.get(Number(line.lineId))?.copies ?? null,
            })),
          },
        };
      },
    }),

    defineRoute({
      method: 'post',
      path: `${BILLS}/:id/labels`,
      summary: "Print a bill's dosing stickers (PDF), keeping what was printed",
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { params: idParamsSchema, body: printLabelsBodySchema },
      responses: { 200: { description: 'The stickers, application/pdf' } },
      handler: async ({ req, res, input }) => {
        const billId = input.params.id;
        const { bill, lines } = await readBill(billId, await currentPharmacyId(prisma, config));
        const onBill = new Set(lines.map((line) => Number(line.lineId)));
        /** @type {{ lineId: number, text: string, copies: number }[]} */
        const labels = /** @type {any} */ (input.body).labels;
        const details = labels.flatMap((label, index) => [
          ...(onBill.has(label.lineId)
            ? []
            : [{ path: `body.labels.${index}.lineId`, message: 'This line is not on the bill' }]),
          ...(label.copies > config.labels.maxCopies
            ? [
                {
                  path: `body.labels.${index}.copies`,
                  message: `Print at most ${config.labels.maxCopies} at a time`,
                },
              ]
            : []),
        ]);
        if (details.length) throw validationFailed(details);

        const printId = randomUUID();
        const by = getAuth(res).employeeId;
        const printed = labels.filter((label) => label.copies > 0);
        await prisma.$transaction(
          printed.map(
            (label) => prisma.$executeRaw`
              INSERT INTO ih_dispense_label (PRINT_ID, BILL_ID, SALES_ITEMS_ID, LABEL_TEXT, COPIES, PRINTED_BY)
              VALUES (${printId}, ${billId}, ${label.lineId}, ${label.text}, ${label.copies}, ${by})`,
          ),
        );
        const pdf = await pdfOf(
          bill,
          lines,
          new Map(
            printed.map((label) => [label.lineId, { text: label.text, copies: label.copies }]),
          ),
        );
        await record(req, 'labels.print', billId);
        sendPdf(res, pdf, billId);
      },
    }),

    defineRoute({
      method: 'get',
      path: `${BILLS}/:id/labels/pdf`,
      summary: "Reprint a bill's dosing stickers exactly as last printed (PDF)",
      tags: TAGS,
      permissions: POLICIES.sales.read,
      request: { params: idParamsSchema },
      responses: { 200: { description: 'The stickers, application/pdf' } },
      handler: async ({ req, res, input }) => {
        const billId = input.params.id;
        const { bill, lines } = await readBill(billId, await currentPharmacyId(prisma, config));
        const saved = await lastPrint(billId);
        if (!saved.size) throw notFound('No labels were printed for this bill');
        const pdf = await pdfOf(bill, lines, saved);
        await record(req, 'labels.reprint', billId);
        sendPdf(res, pdf, billId);
      },
    }),
  ];
}
