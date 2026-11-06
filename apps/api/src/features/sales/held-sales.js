/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over the additive table */
import { priceBill } from '@ihealth/shared/pricing';

import { fromDbTime, Prisma } from '#db';

import { conflict, notFound, validationFailed } from '../../lib/errors.js';
import { loadBatches } from './batches.repository.js';

const GONE = 'This sale is no longer on hold. It may have been recalled at another till.';

/**
 * @typedef {object} HeldSaleInput
 * @property {{ stockId: number, quantity: number, discountPercent: number }[]} lines
 * @property {number} [customerId]
 * @property {string | null} [customerName]
 * @property {string | null} [customerPhone]
 * @property {string | null} [note]
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const textOrNull = (value) => String(value ?? '').trim() || null;

/**
 * @param {unknown} value JSON as text or already parsed, depending on the driver.
 * @returns {{ stockId: number, quantity: number, discountPercent: number }[]}
 */
const parseLines = (value) =>
  /** @type {any[]} */ (typeof value === 'string' ? JSON.parse(value) : value).map((line) => ({
    stockId: Number(line.stockId),
    quantity: Number(line.quantity),
    discountPercent: Number(line.discountPercent ?? 0),
  }));

/**
 * @param {Record<string, any>} row
 * @returns {import('zod').infer<typeof import('@ihealth/shared/schemas').heldSaleSummarySchema>}
 */
const toSummary = (row) => ({
  id: Number(row.id),
  customerName: textOrNull(row.customerName),
  note: textOrNull(row.note),
  lineCount: Number(row.lineCount),
  net: Number(row.net).toFixed(2),
  heldBy: textOrNull(row.heldBy),
  // The table's default is the database clock: the pharmacy's wall clock.
  heldAt: fromDbTime(row.heldAt).toISOString(),
});

const SUMMARY_SQL = Prisma.sql`
  SELECT h.HELD_SALE_ID AS id, h.CUSTOMER_NAME AS customerName, h.NOTE AS note,
    h.LINE_COUNT AS lineCount, h.NET_AMOUNT AS net, h.CREATED_AT AS heldAt,
    TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) AS heldBy
  FROM ih_held_sale h LEFT JOIN employee e ON e.EMPLOYEE_ID = h.EMPLOYEE_ID`;

/**
 * Sales parked at the till. Holding keeps only what was chosen; recalling takes the sale off hold
 * in the same step, so two tills cannot both recall it.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The service.
 */
export function createHeldSales({ prisma, config }) {
  return {
    /**
     * @param {number} pharmacyId
     * @returns {Promise<ReturnType<typeof toSummary>[]>}
     */
    async list(pharmacyId) {
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        ${SUMMARY_SQL} WHERE h.PHARMACY_ID = ${pharmacyId}
        ORDER BY h.CREATED_AT DESC, h.HELD_SALE_ID DESC LIMIT ${config.sales.maxHeld}`;
      return rows.map(toSummary);
    },

    /**
     * @param {HeldSaleInput} input
     * @param {{ employeeId: number, pharmacyId: number }} actor
     * @returns {Promise<ReturnType<typeof toSummary>>}
     */
    async hold(input, { employeeId, pharmacyId }) {
      return prisma.$transaction(async (tx) => {
        /** @type {{ count: bigint | number }[]} */
        const [{ count }] = await tx.$queryRaw`
          SELECT COUNT(*) AS count FROM ih_held_sale WHERE PHARMACY_ID = ${pharmacyId}`;
        if (Number(count) >= config.sales.maxHeld) {
          throw conflict(
            `${config.sales.maxHeld} sales are already on hold. Recall or discard one first.`,
          );
        }

        const batches = await loadBatches(
          tx,
          [...new Set(input.lines.map((line) => line.stockId))],
          pharmacyId,
        );
        const missing = input.lines
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => !batches.has(line.stockId))
          .map(({ index }) => ({
            path: `body.lines.${index}.stockId`,
            message: 'This batch no longer exists',
          }));
        if (missing.length) throw validationFailed(missing);

        const { net } = priceBill(
          input.lines.map((line) => {
            const batch = /** @type {Record<string, any>} */ (batches.get(line.stockId));
            return {
              labelPrice: Number(batch.labelPrice ?? 0),
              quantity: line.quantity,
              discountPercent: line.discountPercent,
              vatPercent: Number(batch.vatPercent ?? 0),
            };
          }),
          { roundingStep: config.sales.roundingStep },
        );

        const customer = input.customerId
          ? await tx.customer.findUnique({
              where: { customerId: input.customerId },
              select: { firstNm: true, lastNm: true, phoneNbr: true },
            })
          : null;
        if (input.customerId && !customer)
          throw validationFailed([
            { path: 'body.customerId', message: 'This customer no longer exists' },
          ]);
        const customerName =
          (customer
            ? [customer.firstNm, customer.lastNm]
                .map((part) => part?.trim())
                .filter(Boolean)
                .join(' ')
            : null) ||
          input.customerName ||
          null;

        const lines = input.lines.map(({ stockId, quantity, discountPercent }) => ({
          stockId,
          quantity,
          discountPercent,
        }));
        await tx.$executeRaw`
          INSERT INTO ih_held_sale (PHARMACY_ID, EMPLOYEE_ID, CUSTOMER_ID, CUSTOMER_NAME, CUSTOMER_PHONE,
            NOTE, LINES_JSON, LINE_COUNT, NET_AMOUNT)
          VALUES (${pharmacyId}, ${employeeId}, ${input.customerId ?? null}, ${customerName},
            ${customer?.phoneNbr?.trim() || input.customerPhone || null}, ${input.note ?? null},
            ${JSON.stringify(lines)}, ${lines.length}, ${net})`;
        /** @type {Record<string, any>[]} */
        const [row] = await tx.$queryRaw`${SUMMARY_SQL} WHERE h.HELD_SALE_ID = LAST_INSERT_ID()`;
        return toSummary(row);
      });
    },

    /**
     * Takes a sale off hold and returns it.
     *
     * @param {number} id
     * @param {number} pharmacyId
     * @returns {Promise<import('zod').infer<typeof import('@ihealth/shared/schemas').heldSaleSchema>>}
     */
    async recall(id, pharmacyId) {
      return prisma.$transaction(async (tx) => {
        /** @type {Record<string, any>[]} */
        const [row] = await tx.$queryRaw`
          SELECT HELD_SALE_ID AS id, CUSTOMER_ID AS customerId, CUSTOMER_NAME AS customerName,
            CUSTOMER_PHONE AS customerPhone, NOTE AS note, LINES_JSON AS linesJson
          FROM ih_held_sale WHERE HELD_SALE_ID = ${id} AND PHARMACY_ID = ${pharmacyId}
          FOR UPDATE`;
        if (!row) throw notFound(GONE);
        await tx.$executeRaw`DELETE FROM ih_held_sale WHERE HELD_SALE_ID = ${id}`;
        return {
          id: Number(row.id),
          customerId: row.customerId === null ? null : Number(row.customerId),
          customerName: textOrNull(row.customerName),
          customerPhone: textOrNull(row.customerPhone),
          note: textOrNull(row.note),
          lines: parseLines(row.linesJson),
        };
      });
    },

    /**
     * @param {number} id
     * @param {number} pharmacyId
     * @returns {Promise<void>}
     */
    async discard(id, pharmacyId) {
      const removed = await prisma.$executeRaw`
        DELETE FROM ih_held_sale WHERE HELD_SALE_ID = ${id} AND PHARMACY_ID = ${pharmacyId}`;
      if (!removed) throw notFound(GONE);
    },
  };
}
