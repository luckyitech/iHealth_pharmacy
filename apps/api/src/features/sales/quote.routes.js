/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over the legacy stock table */
import { POLICIES } from '@ihealth/shared/permissions';
import { moneyToString, roundMoney } from '@ihealth/shared/money';
import { priceBill } from '@ihealth/shared/pricing';
import {
  dataResponseSchema,
  LINE_WARNINGS,
  saleQuoteBodySchema,
  saleQuoteSchema,
} from '@ihealth/shared/schemas';

import { Prisma } from '#db';

import { defineRoute } from '../../http/define-route.js';
import { validationFailed } from '../../lib/errors.js';
import { currentPharmacyId } from '../masters/current-pharmacy.js';

/** `YYYY-MM-DD` in a time zone. */
const ISO_DATE_LOCALE = 'en-CA'; // hardcode-ok: a locale that formats dates as YYYY-MM-DD, used only to build text

/**
 * @param {string} timeZone
 * @returns {string} Today's date in that time zone.
 */
const todayIn = (timeZone) =>
  new Intl.DateTimeFormat(ISO_DATE_LOCALE, { timeZone }).format(new Date());

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const textOrNull = (value) => String(value ?? '').trim() || null;

/**
 * Reads the batches of a sale with what pricing needs. Raw SQL: some legacy expiry dates are zero.
 *
 * @param {import('#db').PrismaClient} prisma
 * @param {number[]} stockIds
 * @param {number} pharmacyId
 * @returns {Promise<Map<number, Record<string, any>>>}
 */
export async function loadBatches(prisma, stockIds, pharmacyId) {
  /** @type {Record<string, any>[]} */
  const rows = await prisma.$queryRaw`
    SELECT st.STOCK_ID AS stockId, st.ITEM_ID AS itemId, it.ITEM_NM AS itemName, it.ITEM_CD AS itemCode,
      st.BATCH_NO AS batchNo, CAST(st.EXPIRY_DT AS CHAR) AS expiryDate, st.QUANTITY AS available,
      st.UNIT_SALE_RATE AS labelPrice, COALESCE(tc.CATEGORY_VALUE, st.VAT, 0) AS vatPercent,
      tc.CATEGORY_CODE AS taxCode, st.UNIT_PURCHASE_RATE AS unitCost,
      st.PURCHASE_DISCOUNT_PERCENTAGE AS costDiscountPercent
    FROM stock st
      LEFT JOIN items it ON it.ITEM_ID = st.ITEM_ID
      LEFT JOIN taxcategory tc ON tc.TAXCATEGORY_ID = st.TAX_CATEGORY_ID
    WHERE st.STOCK_ID IN (${Prisma.join(stockIds)}) AND st.PHARMACY_ID = ${pharmacyId}`;
  return new Map(rows.map((row) => [Number(row.stockId), row]));
}

/**
 * Prices a sale the way the server will charge it: the till sends batches, quantities and discounts,
 * and the server takes prices, VAT and costs from the batches. Nothing is saved.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createSaleQuoteRoutes({ prisma, config }) {
  return [
    defineRoute({
      method: 'post',
      path: '/sales/quote',
      summary: 'Price a sale from its batches (nothing is saved)',
      description:
        'Prices, VAT and costs come from the batches; the answer never includes costs or profit.',
      tags: ['Sales'],
      permissions: POLICIES.sales.sell,
      request: { body: saleQuoteBodySchema },
      responses: {
        200: { description: 'The priced sale', schema: dataResponseSchema(saleQuoteSchema) },
      },
      handler: async ({ input }) => {
        const { lines } =
          /** @type {{ lines: { stockId: number, quantity: number, discountPercent: number }[] }} */ (
            input.body
          );
        const pharmacyId = await currentPharmacyId(prisma, config);
        const batches = await loadBatches(
          prisma,
          [...new Set(lines.map((line) => line.stockId))],
          pharmacyId,
        );
        const missing = lines
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => !batches.has(line.stockId))
          .map(({ index }) => ({
            path: `body.lines.${index}.stockId`,
            message: 'This batch no longer exists',
          }));
        if (missing.length) throw validationFailed(missing);

        const today = todayIn(config.region.timeZone);
        /** Units asked for per batch, across lines, to compare with what it has. */
        const asked = new Map();
        for (const line of lines)
          asked.set(line.stockId, (asked.get(line.stockId) ?? 0) + line.quantity);

        const inputs = lines.map((line) => {
          const batch = /** @type {Record<string, any>} */ (batches.get(line.stockId));
          return {
            labelPrice: Number(batch.labelPrice ?? 0),
            quantity: line.quantity,
            discountPercent: line.discountPercent,
            vatPercent: Number(batch.vatPercent ?? 0),
          };
        });
        const priced = priceBill(inputs, { roundingStep: config.sales.roundingStep });

        return {
          data: {
            lines: lines.map((line, index) => {
              const batch = /** @type {Record<string, any>} */ (batches.get(line.stockId));
              const expiryDate = textOrNull(batch.expiryDate);
              const validExpiry = expiryDate && !expiryDate.startsWith('0000') ? expiryDate : null;
              const available = Number(batch.available ?? 0);
              /** @type {string[]} */
              const warnings = [];
              if (validExpiry && validExpiry < today) warnings.push(LINE_WARNINGS.EXPIRED);
              if (asked.get(line.stockId) > available)
                warnings.push(LINE_WARNINGS.INSUFFICIENT_STOCK);
              // Costs and profit stay on the server: the till never sees them.
              const { unitPrice, gross, discount, vat, amount } = priced.lines[index];
              return {
                stockId: line.stockId,
                itemId:
                  batch.itemId === null || batch.itemId === undefined ? null : Number(batch.itemId),
                itemName: textOrNull(batch.itemName),
                itemCode: textOrNull(batch.itemCode),
                batchNo: textOrNull(batch.batchNo),
                expiryDate: validExpiry,
                available,
                quantity: line.quantity,
                discountPercent: line.discountPercent,
                vatPercent: inputs[index].vatPercent,
                taxCode: textOrNull(batch.taxCode),
                labelPrice: moneyToString(roundMoney(inputs[index].labelPrice)),
                unitPrice,
                gross,
                discount,
                vat,
                amount,
                warnings: /** @type {any} */ (warnings),
              };
            }),
            totals: {
              gross: priced.gross,
              discount: priced.discount,
              vat: priced.vat,
              subtotal: priced.subtotal,
              roundedOff: priced.roundedOff,
              net: priced.net,
            },
            quantity: priced.quantity,
          },
        };
      },
    }),
  ];
}
