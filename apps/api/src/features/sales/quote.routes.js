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

import { defineRoute } from '../../http/define-route.js';
import { validationFailed } from '../../lib/errors.js';
import { currentPharmacyId } from '../masters/current-pharmacy.js';
import { batchExpiry, loadBatches, todayIn } from './batches.repository.js';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const textOrNull = (value) => String(value ?? '').trim() || null;

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
              const validExpiry = batchExpiry(batch.expiryDate);
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
