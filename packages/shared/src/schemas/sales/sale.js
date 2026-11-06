import { z } from 'zod';

import { compareMoney, nonNegativeMoneySchema } from '../../money/index.js';
import { dateOnlySchema, optionalText } from '../common.js';
import { billDetailSchema, PAYMENT_METHODS } from './bills.js';
import { saleQuoteBodySchema } from './quote.js';

/** Ways to pay at the till. Credit sales come with the Finance phase; credit notes with returns. */
export const SALE_PAYMENT_METHODS = Object.freeze([
  PAYMENT_METHODS.CASH,
  PAYMENT_METHODS.MPESA,
  PAYMENT_METHODS.CARD,
  PAYMENT_METHODS.CHEQUE,
]);

/** A full M-Pesa transaction code: 10 letters and digits, e.g. `QK52AB1XYZ`. */
export const MPESA_CODE_PATTERN = /^[A-Z0-9]{10}$/;

/** Column lengths of the legacy `sales` table, and of the card approval code (additive table). */
const LENGTH = Object.freeze({
  customerName: 100,
  customerPhone: 20,
  remarks: 500,
  chequeNumber: 50,
  cardApprovalCode: 45,
});

/** Who the sale is for: a registered customer, or a name and phone typed on the bill. */
export const saleCustomerShape = Object.freeze({
  customerId: z.coerce.number().int().positive().optional(),
  customerName: optionalText(LENGTH.customerName),
  customerPhone: optionalText(LENGTH.customerPhone),
});

/**
 * One way of paying. `reference` is the M-Pesa code, the card machine's approval code or the cheque
 * number; a cheque also has its bank and date.
 */
export const salePaymentSchema = z
  .object({
    method: z.enum(SALE_PAYMENT_METHODS, { error: 'Choose how they paid' }),
    amount: nonNegativeMoneySchema,
    reference: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .optional(),
    bankId: z.coerce.number().int().positive().optional(),
    chequeDate: dateOnlySchema.optional(),
  })
  .superRefine((payment, context) => {
    /**
     * @param {string} path
     * @param {string} message
     * @returns {void}
     */
    const problem = (path, message) => context.addIssue({ code: 'custom', path: [path], message });
    const reference = payment.reference ?? '';
    if (payment.method !== PAYMENT_METHODS.CASH && compareMoney(payment.amount, 0) <= 0)
      problem('amount', 'Enter the amount');
    if (payment.method === PAYMENT_METHODS.MPESA && !MPESA_CODE_PATTERN.test(reference))
      problem('reference', 'Enter the full 10-character M-Pesa code, e.g. QK52AB1XYZ');
    if (payment.method === PAYMENT_METHODS.CARD) {
      if (!reference) problem('reference', 'Enter the approval code from the card machine slip');
      else if (reference.length > LENGTH.cardApprovalCode)
        problem('reference', `Use at most ${LENGTH.cardApprovalCode} characters`);
    }
    if (payment.method === PAYMENT_METHODS.CHEQUE) {
      if (!reference) problem('reference', 'Enter the cheque number');
      else if (reference.length > LENGTH.chequeNumber)
        problem('reference', `Use at most ${LENGTH.chequeNumber} characters`);
      if (!payment.bankId) problem('bankId', 'Choose the bank');
      if (!payment.chequeDate) problem('chequeDate', 'Enter the date on the cheque');
    }
  });

/**
 * Completing a sale: what was chosen and how it was paid. Prices and totals are never sent; the
 * server works them out from the batches.
 */
export const saleBodySchema = saleQuoteBodySchema.extend({
  /** Made by the till once per sale, so a repeated request cannot sell twice. */
  requestKey: z.uuid('A sale needs a request key'),
  ...saleCustomerShape,
  payments: z
    .array(salePaymentSchema)
    .min(1, 'Add how they paid')
    .refine(
      (payments) => new Set(payments.map((payment) => payment.method)).size === payments.length,
      'Each way of paying can appear once',
    ),
  remarks: optionalText(LENGTH.remarks),
  /** From POST /sales/approvals, when a line needs a second person's approval. */
  approvalToken: z.uuid().optional(),
});

/** A completed sale: the saved bill, and the change to give back. */
export const completedSaleSchema = billDetailSchema.extend({ change: z.string() });
