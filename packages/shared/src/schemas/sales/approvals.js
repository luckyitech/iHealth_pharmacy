import { z } from 'zod';

import { dateOnlySchema, requiredText } from '../common.js';
import { APPROVAL_REASONS, saleQuoteBodySchema } from './quote.js';

/** What was approved. */
export const APPROVAL_KINDS = Object.freeze({ SALE: 'sale', CANCEL: 'cancel', RETURN: 'return' });

const REASON_LENGTH = 200;
const USERNAME_LENGTH = 100;
const PIN_LENGTH = 20;

const reasonSchema = requiredText(REASON_LENGTH).describe('Why it is needed');

/** The second person: their username and approval PIN. Never stored or logged as typed. */
export const approverShape = Object.freeze({
  approver: z
    .string({ error: "Enter the approver's username" })
    .trim()
    .min(1, "Enter the approver's username")
    .max(USERNAME_LENGTH),
  pin: z
    .string({ error: "Enter the approver's PIN" })
    .min(1, "Enter the approver's PIN")
    .max(PIN_LENGTH),
});

/** Asking for approval of a sale: the same lines the till will send, the reason and the approver. */
export const saleApprovalBodySchema = saleQuoteBodySchema.extend({
  reason: reasonSchema,
  ...approverShape,
});

export const approvedItemSchema = z.object({
  stockId: z.number().int(),
  itemName: z.string().nullable(),
  reasons: z.array(z.enum(Object.values(APPROVAL_REASONS))),
  /** Below the shelf price, for the quantity sold. */
  givenAway: z.string(),
});

/** An approval given: the token the till sends with the sale. */
export const saleApprovalSchema = z.object({
  token: z.uuid(),
  approvedBy: z.string(),
  items: z.array(approvedItemSchema),
  givenAway: z.string(),
});

/** Cancelling a bill: a reason, and a second person when the cashier may not do it alone. */
export const cancelBillBodySchema = z.object({
  reason: reasonSchema,
  approver: approverShape.approver.optional(),
  pin: approverShape.pin.optional(),
});

/** One approval, as Sales history and the daily report show it. */
export const billApprovalSchema = z.object({
  id: z.number().int(),
  kind: z.enum(Object.values(APPROVAL_KINDS)),
  at: z.string(),
  billId: z.number().int().nullable(),
  billCode: z.string().nullable(),
  requestedBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  reason: z.string(),
  items: z.array(approvedItemSchema),
  givenAway: z.string(),
  // False for an approval given but never used: the sale was not completed.
  used: z.boolean(),
});

/** Filters of the approvals list (`GET /sales/approvals`), besides the search and the sort. */
export const approvalListFiltersShape = Object.freeze({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  kind: z.enum(Object.values(APPROVAL_KINDS)).optional(),
  approverId: z.coerce.number().int().positive().optional(),
});
