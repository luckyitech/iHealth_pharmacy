/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy tables */
import {
  addMoney,
  compareMoney,
  moneyToString,
  subtractMoney,
  toMoney,
} from '@ihealth/shared/money';
import { hasAnyPermission, POLICIES } from '@ihealth/shared/permissions';
import { priceBill } from '@ihealth/shared/pricing';
import { PAYMENT_METHODS } from '@ihealth/shared/schemas';

import { forbidden, validationFailed } from '../../lib/errors.js';
import { DOCUMENT_KINDS, nextDocumentCode } from '../document-codes/document-codes.js';
import { toLegacyDate } from '../masters/legacy-mapping.js';
import { batchExpiry, loadBatches, todayIn } from './batches.repository.js';
import { toDbTime } from '#db';

/** Legacy bill status and flag values. */
const LEGACY_PAID = 'Paid';
const ACTIVE = 'Y';
/** Prisma's code for a raw query that failed, e.g. on a duplicate key. */
const RAW_QUERY_FAILED = 'P2010';
/** MySQL's duplicate-key error number. */
const DUPLICATE_KEY = 1062;

/**
 * @typedef {{ method: string, amount: string, reference?: string, bankId?: number, chequeDate?: string }} SalePayment
 */

/** How payment methods are named in messages. */
const METHOD_NAMES = Object.freeze({
  [PAYMENT_METHODS.MPESA]: 'M-Pesa',
  [PAYMENT_METHODS.CARD]: 'Card',
  [PAYMENT_METHODS.CHEQUE]: 'The cheque',
});

/**
 * @param {string} date `YYYY-MM-DD`
 * @param {number} months
 * @returns {string} The same day that many months earlier, `YYYY-MM-DD`.
 */
function monthsBefore(date, months) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCMonth(day.getUTCMonth() - months);
  return day.toISOString().slice(0, 10);
}

/**
 * @typedef {object} SaleInput
 * @property {string} requestKey
 * @property {{ stockId: number, quantity: number, discountPercent: number }[]} lines
 * @property {number} [customerId]
 * @property {string | null} [customerName]
 * @property {string | null} [customerPhone]
 * @property {SalePayment[]} payments
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
 * M-Pesa, card and cheque together may not exceed the bill; cash may (the customer gets change).
 *
 * @param {SalePayment[]} payments
 * @param {string} net
 * @returns {{ cash: string | null, change: string, other: Map<string, { amount: string, payment: SalePayment }> }}
 */
function settle(payments, net) {
  const cash = payments.find((payment) => payment.method === PAYMENT_METHODS.CASH);
  const nonCash = payments
    .map((payment, index) => ({ payment, index }))
    .filter(({ payment }) => payment.method !== PAYMENT_METHODS.CASH);
  const nonCashTotal = addMoney(...nonCash.map(({ payment }) => payment.amount));
  if (compareMoney(nonCashTotal, net) > 0) {
    const last = /** @type {{ payment: SalePayment, index: number }} */ (nonCash.at(-1));
    throw validationFailed([
      {
        path: `body.payments.${last.index}.amount`,
        message:
          nonCash.length === 1
            ? `${METHOD_NAMES[/** @type {keyof typeof METHOD_NAMES} */ (last.payment.method)]} cannot be more than the bill`
            : 'M-Pesa, card and cheque together cannot be more than the bill',
      },
    ]);
  }
  const cashDue = subtractMoney(net, nonCashTotal);
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
    change: moneyToString(subtractMoney(tendered, cashDue)),
    other: new Map(
      nonCash.map(({ payment }) => [
        payment.method,
        { amount: moneyToString(payment.amount), payment },
      ]),
    ),
  };
}

/**
 * Refuses a cheque the person may not take, from a bank not on the list, or dated too long ago.
 *
 * @param {any} tx
 * @param {SalePayment[]} payments
 * @param {{ permissionIds: ReadonlySet<number>, today: string, maxAgeMonths: number }} rules
 * @returns {Promise<void>}
 */
async function assertChequeAcceptable(tx, payments, { permissionIds, today, maxAgeMonths }) {
  const index = payments.findIndex((payment) => payment.method === PAYMENT_METHODS.CHEQUE);
  if (index < 0) return;
  if (!hasAnyPermission(permissionIds, POLICIES.sales.acceptCheque))
    throw forbidden('You may not take cheques. Ask someone who approves sales.');
  const cheque = payments[index];
  /** @type {{ path: string, message: string }[]} */
  const details = [];
  const bank = await tx.ihBank.findUnique({
    where: { bankId: cheque.bankId },
    select: { activeS: true },
  });
  if (!bank || bank.activeS !== ACTIVE)
    details.push({ path: `body.payments.${index}.bankId`, message: 'Choose a bank from the list' });
  if (/** @type {string} */ (cheque.chequeDate) < monthsBefore(today, maxAgeMonths)) {
    details.push({
      path: `body.payments.${index}.chequeDate`,
      message: `This cheque is older than ${maxAgeMonths} months; banks no longer pay it`,
    });
  }
  if (details.length) throw validationFailed(details);
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
     * @param {{ employeeId: number, pharmacyId: number, permissionIds: ReadonlySet<number> }} actor
     * @returns {Promise<{ billId: number, change: string, repeated: boolean }>}
     */
    async complete(input, { employeeId, pharmacyId, permissionIds }) {
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
          await assertChequeAcceptable(tx, input.payments, {
            permissionIds,
            today,
            maxAgeMonths: config.sales.chequeMaxAgeMonths,
          });
          const mpesa = payment.other.get(PAYMENT_METHODS.MPESA);
          const card = payment.other.get(PAYMENT_METHODS.CARD);
          const cheque = payment.other.get(PAYMENT_METHODS.CHEQUE);
          const mpesaCode = mpesa?.payment.reference ?? null;

          if (mpesaCode) {
            /** @type {{ code: string | null }[]} */
            const [used] = await tx.$queryRaw`
              SELECT BILL_CODE AS code FROM sales WHERE UPI_TRANS_ID = ${mpesaCode} LIMIT 1`;
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
          // Stamps hold the pharmacy's wall clock, as the legacy app writes them.
          const stamp = toDbTime(now);
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
              upiAmount: mpesa ? Number(mpesa.amount) : null,
              upiTransId: mpesaCode,
              creditCardAmount: card ? Number(card.amount) : null,
              chequeAmt: cheque ? Number(cheque.amount) : null,
              chequeNumber: cheque?.payment.reference ?? null,
              chequeDate: toLegacyDate(cheque?.payment.chequeDate ?? null),
              remarks: input.remarks ?? null,
              pharmacyId,
              employeeId,
              activeS: ACTIVE,
              creationTs: stamp,
              creationUserId: by,
              lastUpdateTs: stamp,
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
                creationTs: stamp,
                creationUserId: by,
                lastUpdateTs: stamp,
                lastUpdateUserId: by,
              };
            }),
          });

          // The approval code and the bank have no legacy column (the legacy app put the code in TAXNO).
          if (card || cheque) {
            await tx.$executeRaw`
              INSERT INTO ih_sale_payment_detail (BILL_ID, CARD_APPROVAL_CODE, CHEQUE_BANK_ID)
              VALUES (${bill.billId}, ${card?.payment.reference ?? null},
                ${cheque?.payment.bankId ?? null})`;
          }

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
