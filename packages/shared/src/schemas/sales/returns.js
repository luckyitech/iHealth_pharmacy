import { z } from 'zod';

import { approverShape } from './approvals.js';
import { MPESA_CODE_PATTERN } from './sale.js';

/** What happens to the units that come back. */
export const RETURN_CONDITIONS = Object.freeze({
  /** Good to sell again: back into the batch they were sold from. */
  RESTOCK: 'restock',
  /** Damaged, opened or expired: written off, never sold again. */
  WRITE_OFF: 'writeOff',
});

/** How the money goes back. */
export const REFUND_METHODS = Object.freeze({
  CASH: 'cash',
  MPESA: 'mpesa',
  CREDIT_NOTE: 'creditNote',
});

/** Longest reason, as the legacy return line keeps it. */
const REASON_LENGTH = 30;
const text = z.string().nullable();

/** A bill's line as it can be returned. */
export const returnableLineSchema = z.object({
  lineId: z.number().int(),
  itemName: text,
  batchNo: text,
  sold: z.number().int(),
  /** Already returned, in this app or the legacy one. */
  returned: z.number().int(),
  returnable: z.number().int(),
  /** What the customer paid per unit, discounts included. */
  unitRefund: z.string(),
});

export const returnableBillSchema = z.object({
  billId: z.number().int(),
  billCode: text,
  billDate: text,
  customerName: text,
  customerId: z.number().int().nullable(),
  /** Days since the sale, and the most the pharmacy allows. */
  daysSince: z.number().int(),
  returnDays: z.number().int(),
  /** Why the bill cannot be returned, when it cannot. */
  blocked: text,
  lines: z.array(returnableLineSchema),
});

export const returnBodySchema = z
  .object({
    lines: z
      .array(
        z.object({
          lineId: z.coerce.number().int().positive(),
          quantity: z.coerce.number().int().min(1, 'Return at least one'),
          condition: z.enum(Object.values(RETURN_CONDITIONS)),
        }),
      )
      .min(1, 'Choose what comes back'),
    reason: z
      .string({ error: 'Enter a reason' })
      .trim()
      .min(1, 'Enter a reason')
      .max(REASON_LENGTH, `Use at most ${REASON_LENGTH} characters`),
    refund: z.enum(Object.values(REFUND_METHODS), { error: 'Choose how the money goes back' }),
    /** The code of the M-Pesa payment sent back to the customer. */
    mpesaCode: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .optional(),
    ...approverShape,
  })
  .superRefine((body, context) => {
    if (body.refund === REFUND_METHODS.MPESA && !MPESA_CODE_PATTERN.test(body.mpesaCode ?? ''))
      context.addIssue({
        code: 'custom',
        path: ['mpesaCode'],
        message: 'Enter the 10-character code of the M-Pesa payment sent back',
      });
    if (new Set(body.lines.map((line) => line.lineId)).size !== body.lines.length)
      context.addIssue({ code: 'custom', path: ['lines'], message: 'Each line can appear once' });
  });

/** A credit note: an amount the customer can spend on a later visit. */
export const creditNoteSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  customerName: text,
  amount: z.string(),
  balance: z.string(),
  expiresOn: text,
  /** The invoice it was issued against (for eTIMS). */
  originalBillCode: text,
});

export const completedReturnSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  billId: z.number().int(),
  billCode: text,
  refund: z.string(),
  refundMethod: z.enum(Object.values(REFUND_METHODS)),
  approvedBy: z.string(),
  creditNote: creditNoteSchema.nullable(),
});

/** A credit note looked up at the till: what is left on it, and why it cannot be used if not. */
export const creditNoteLookupSchema = creditNoteSchema.extend({
  /** Why it cannot pay for anything, when it cannot. */
  problem: text,
});

/** A return in the day's list. Returns made in the legacy app have no approver or receipt here. */
export const returnSummarySchema = z.object({
  id: z.number().int(),
  code: z.string(),
  /** When it was made; legacy returns only have a date. */
  at: text,
  billId: z.number().int(),
  billCode: text,
  customerName: text,
  lineCount: z.number().int(),
  refund: z.string(),
  refundMethod: z.enum(Object.values(REFUND_METHODS)).nullable(),
  reason: text,
  requestedBy: text,
  approvedBy: text,
  /** Made in the new app, so its receipt can be printed again. */
  hasReceipt: z.boolean(),
});

export const returnDayQuerySchema = z.object({ date: z.iso.date('Use the format YYYY-MM-DD') });

/** Where a credit note stands. */
export const CREDIT_NOTE_STATES = Object.freeze({
  OPEN: 'open',
  USED_UP: 'usedUp',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
});

export const creditNoteSummarySchema = creditNoteSchema.extend({
  issuedOn: text,
  // Who issued and who approved it, and when it was made (the legacy columns, never typed).
  issuedAt: text,
  issuedBy: text,
  approvedBy: text,
  state: z.enum(Object.values(CREDIT_NOTE_STATES)),
});

export const creditNoteListFiltersShape = Object.freeze({
  state: z.enum(Object.values(CREDIT_NOTE_STATES)).optional(),
});

/** One time a credit note paid for a bill. */
export const creditNoteUseSchema = z.object({
  billId: z.number().int(),
  billCode: text,
  usedAt: z.string(),
  amount: z.string(),
  balanceAfter: z.string(),
  usedBy: text,
});
