/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy tables */
import { compareMoney, moneyToString, subtractMoney, toMoney } from '@ihealth/shared/money';
import { priceBill } from '@ihealth/shared/pricing';
import { PAYMENT_METHODS } from '@ihealth/shared/schemas';

import { validationFailed } from '../../lib/errors.js';
import { DOCUMENT_KINDS, nextDocumentCode } from '../document-codes/document-codes.js';
import { toLegacyDate } from '../masters/legacy-mapping.js';
import { batchExpiry, loadBatches, todayIn } from './batches.repository.js';

/** Legacy bill status and flag values. */
const LEGACY_PAID = 'Paid';
const ACTIVE = 'Y';
/** Prisma's code for a raw query that failed, e.g. on a duplicate key. */
const RAW_QUERY_FAILED = 'P2010';
/** MySQL's duplicate-key error number. */
const DUPLICATE_KEY = 1062;

/**
 * @typedef {object} SaleInput
 * @property {string} requestKey
 * @property {{ stockId: number, quantity: number, discountPercent: number }[]} lines
 * @property {number} [customerId]
 * @property {string | null} [customerName]
 * @property {string | null} [customerPhone]
 * @property {{ method: string, amount: string, reference?: string }[]} payments
 * @property {string | null} [remarks]
 */

/**
 * Refuses lines that cannot be sold as asked: a batch that is gone or expired, more units than it
 * has (across lines), or a discount above what a cashier may give alone.
 *
 * @param {SaleInput['lines']} lines
 * @param {Map<number, Record<string, any>>} batches
 * @param {{ today: string, discountLimit: number }} rules
 * @returns {void}
 */
function assertLinesSellable(lines, batches, { today, discountLimit }) {
  /** @type {{ path: string, message: string }[]} */
  const details = [];
  /** @type {Map<number, number>} */
  const asked = new Map();
  for (const line of lines) asked.set(line.stockId, (asked.get(line.stockId) ?? 0) + line.quantity);
  lines.forEach((line, index) => {
    const path = `body.lines.${index}`;
    const batch = batches.get(line.stockId);
    if (!batch) {
      details.push({ path: `${path}.stockId`, message: 'This batch no longer exists' });
      return;
    }
    const expiry = batchExpiry(batch.expiryDate);
    if (expiry && expiry < today)
      details.push({
        path: `${path}.stockId`,
        message: 'This batch has expired and cannot be sold',
      });
    const available = Number(batch.available ?? 0);
    if (/** @type {number} */ (asked.get(line.stockId)) > available) {
      details.push({
        path: `${path}.quantity`,
        message: `Only ${Math.max(available, 0)} left in this batch`,
      });
    }
    if (line.discountPercent > discountLimit) {
      details.push({
        path: `${path}.discountPercent`,
        message: `Discounts above ${discountLimit}% need a second person's approval`,
      });
    }
  });
  if (details.length) throw validationFailed(details);
}

/**
 * Checks the payments against the net and works out what stays in the till and the change.
 * M-Pesa may not exceed the bill; cash may (the customer gets change).
 *
 * @param {SaleInput['payments']} payments
 * @param {string} net
 * @returns {{ cash: string | null, mpesa: string | null, mpesaCode: string | null, change: string }}
 */
function settle(payments, net) {
  const cash = payments.find((payment) => payment.method === PAYMENT_METHODS.CASH);
  const mpesa = payments.find((payment) => payment.method === PAYMENT_METHODS.MPESA);
  const mpesaIndex = payments.findIndex((payment) => payment.method === PAYMENT_METHODS.MPESA);
  const mpesaAmount = toMoney(mpesa?.amount ?? 0);
  if (compareMoney(mpesaAmount, net) > 0) {
    throw validationFailed([
      {
        path: `body.payments.${mpesaIndex}.amount`,
        message: 'M-Pesa cannot be more than the bill',
      },
    ]);
  }
  const cashDue = subtractMoney(net, mpesaAmount);
  const tendered = toMoney(cash?.amount ?? 0);
  if (compareMoney(tendered, cashDue) < 0) {
    throw validationFailed([
      {
        path: 'body.payments',
        message: `The payments are ${moneyToString(subtractMoney(cashDue, tendered))} short of the bill`,
      },
    ]);
  }
  return {
    cash: cashDue.isZero() ? null : moneyToString(cashDue),
    mpesa: mpesaAmount.isZero() ? null : moneyToString(mpesaAmount),
    mpesaCode: mpesa?.reference ?? null,
    change: moneyToString(subtractMoney(tendered, cashDue)),
  };
}

/**
 * Completes a sale in one transaction: the bill number, the bill, its lines and the request key are
 * saved together or not at all. Prices, VAT, profit and totals are worked out here from the batches.
 *
 * The legacy database triggers still do their part when the rows are written: each line takes its
 * quantity off the batch, and the cash goes to the "Sales Till" account. Stock is therefore not
 * changed here, only checked under a lock.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The service.
 */
export function createSaleService({ prisma, config }) {
  /**
   * @param {string} requestKey
   * @returns {Promise<number | null>} The bill already saved for this request.
   */
  const billOfRequest = async (requestKey) => {
    /** @type {{ billId: number }[]} */
    const [row] = await prisma.$queryRaw`
      SELECT BILL_ID AS billId FROM ih_sale_request WHERE REQUEST_KEY = ${requestKey}`;
    return row ? Number(row.billId) : null;
  };

  return {
    /**
     * @param {SaleInput} input
     * @param {{ employeeId: number, pharmacyId: number }} actor
     * @returns {Promise<{ billId: number, change: string, repeated: boolean }>}
     */
    async complete(input, { employeeId, pharmacyId }) {
      const already = await billOfRequest(input.requestKey);
      if (already) return { billId: already, change: '0.00', repeated: true };

      try {
        return await prisma.$transaction(async (tx) => {
          const batches = await loadBatches(
            tx,
            [...new Set(input.lines.map((line) => line.stockId))],
            pharmacyId,
            { lock: true },
          );
          const today = todayIn(config.region.timeZone);
          assertLinesSellable(input.lines, batches, {
            today,
            discountLimit: config.sales.selfDiscountLimit,
          });

          const inputs = input.lines.map((line) => {
            const batch = /** @type {Record<string, any>} */ (batches.get(line.stockId));
            return {
              labelPrice: Number(batch.labelPrice ?? 0),
              quantity: line.quantity,
              discountPercent: line.discountPercent,
              vatPercent: Number(batch.vatPercent ?? 0),
              unitCost: batch.unitCost === null ? null : Number(batch.unitCost),
              costDiscountPercent: Number(batch.costDiscountPercent ?? 0),
            };
          });
          const priced = priceBill(inputs, { roundingStep: config.sales.roundingStep });
          const payment = settle(input.payments, priced.net);

          if (payment.mpesaCode) {
            /** @type {{ code: string | null }[]} */
            const [used] = await tx.$queryRaw`
              SELECT BILL_CODE AS code FROM sales WHERE UPI_TRANS_ID = ${payment.mpesaCode} LIMIT 1`;
            if (used) {
              const index = input.payments.findIndex((p) => p.method === PAYMENT_METHODS.MPESA);
              throw validationFailed([
                {
                  path: `body.payments.${index}.reference`,
                  message: `This M-Pesa code is already on bill ${used.code ?? 'another bill'}`,
                },
              ]);
            }
          }

          const customer = input.customerId
            ? await tx.customer.findUnique({
                where: { customerId: input.customerId },
                select: { customerId: true, firstNm: true, lastNm: true, phoneNbr: true },
              })
            : null;
          if (input.customerId && !customer)
            throw validationFailed([
              { path: 'body.customerId', message: 'This customer no longer exists' },
            ]);

          const by = String(employeeId);
          const now = new Date();
          const billCode = await nextDocumentCode(tx, DOCUMENT_KINDS.SALE, {
            prefix: config.documentCodePrefix,
            timeZone: config.region.timeZone,
            now,
          });
          const sum = (/** @type {number[]} */ values) => values.reduce((a, b) => a + b, 0);
          const bill = await tx.sales.create({
            data: {
              billCode,
              billDate: toLegacyDate(today),
              customerId: customer?.customerId ?? null,
              customerNm:
                (customer
                  ? [customer.firstNm, customer.lastNm].filter(Boolean).join(' ').trim()
                  : null) ||
                input.customerName ||
                null,
              customerPhoneNo: customer?.phoneNbr?.trim() || input.customerPhone || null,
              providerId: config.sales.defaultProviderId ?? null,
              totalProducts: input.lines.length,
              totalQty: priced.quantity,
              // The legacy app saved the sum of the lines' percentages here; reports still read it.
              effectiveOverallDiscount: sum(input.lines.map((line) => line.discountPercent)),
              overallDiscount: Number(priced.discount),
              effectiveVat: sum(inputs.map((line) => line.vatPercent)),
              vatAmt: Number(priced.vat),
              roundedOff: Number(priced.roundedOff),
              totalAmount: Number(priced.gross),
              netAmount: Number(priced.net),
              paidAmount: Number(priced.net),
              balanceAmount: 0,
              paymentStatus: LEGACY_PAID,
              cashAmount: payment.cash === null ? null : Number(payment.cash),
              upiAmount: payment.mpesa === null ? null : Number(payment.mpesa),
              upiTransId: payment.mpesaCode,
              remarks: input.remarks ?? null,
              pharmacyId,
              employeeId,
              activeS: ACTIVE,
              creationTs: now,
              creationUserId: by,
              lastUpdateTs: now,
              lastUpdateUserId: by,
            },
            select: { billId: true },
          });

          await tx.salesItems.createMany({
            data: input.lines.map((line, index) => {
              const batch = /** @type {Record<string, any>} */ (batches.get(line.stockId));
              const lineMoney = priced.lines[index];
              return {
                billId: bill.billId,
                itemId: batch.itemId === null ? null : Number(batch.itemId),
                stockId: line.stockId,
                saleQty: line.quantity,
                unitSalePrice: Number(lineMoney.unitPrice),
                spVat: inputs[index].labelPrice,
                unitPurchasePrice: inputs[index].unitCost,
                discountPercentage: line.discountPercent,
                vat: inputs[index].vatPercent,
                saleAmount: Number(lineMoney.amount),
                pnl: lineMoney.profit === null ? null : Number(lineMoney.profit),
                batchNo: batch.batchNo ?? null,
                barcode: batch.barcode ?? null,
                taxCategoryId: batch.taxCategoryId === null ? null : Number(batch.taxCategoryId),
                creationTs: now,
                creationUserId: by,
                lastUpdateTs: now,
                lastUpdateUserId: by,
              };
            }),
          });

          await tx.$executeRaw`
            INSERT INTO ih_sale_request (REQUEST_KEY, BILL_ID, EMPLOYEE_ID)
            VALUES (${input.requestKey}, ${bill.billId}, ${employeeId})`;
          return { billId: bill.billId, change: payment.change, repeated: false };
        });
      } catch (error) {
        // The same request finished on another connection a moment earlier: answer with its bill.
        const meta = /** @type {any} */ (error)?.meta;
        if (
          /** @type {any} */ (error)?.code === RAW_QUERY_FAILED &&
          String(meta?.code) === String(DUPLICATE_KEY)
        ) {
          const billId = await billOfRequest(input.requestKey);
          if (billId) return { billId, change: '0.00', repeated: true };
        }
        throw error;
      }
    },
  };
}
