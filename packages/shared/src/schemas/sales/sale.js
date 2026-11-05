import { z } from 'zod';

import { nonNegativeMoneySchema } from '../../money/index.js';
import { optionalText } from '../common.js';
import { billDetailSchema, PAYMENT_METHODS } from './bills.js';
import { saleQuoteBodySchema } from './quote.js';

/** Ways to pay a sale in this phase; card, cheque, credit and credit notes follow. */
export const SALE_PAYMENT_METHODS = Object.freeze([PAYMENT_METHODS.CASH, PAYMENT_METHODS.MPESA]);

/** A full M-Pesa transaction code: 10 letters and digits, e.g. `QK52AB1XYZ`. */
export const MPESA_CODE_PATTERN = /^[A-Z0-9]{10}$/;

/** Column lengths of the legacy `sales` table. */
const LENGTH = Object.freeze({ customerName: 100, customerPhone: 20, remarks: 500 });

/** Who the sale is for: a registered customer, or a name and phone typed on the bill. */
export const saleCustomerShape = Object.freeze({
  customerId: z.coerce.number().int().positive().optional(),
  customerName: optionalText(LENGTH.customerName),
  customerPhone: optionalText(LENGTH.customerPhone),
});

export const salePaymentSchema = z
  .object({
    method: z.enum(SALE_PAYMENT_METHODS, { error: 'Choose how they paid' }),
    amount: nonNegativeMoneySchema,
    reference: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .superRefine((payment, context) => {
    if (payment.method !== PAYMENT_METHODS.MPESA) return;
    if (!payment.reference || !MPESA_CODE_PATTERN.test(payment.reference)) {
      context.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'Enter the full 10-character M-Pesa code, e.g. QK52AB1XYZ',
      });
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
});

/** A completed sale: the saved bill, and the change to give back. */
export const completedSaleSchema = billDetailSchema.extend({ change: z.string() });
