import { z } from 'zod';

import { dateOnlySchema } from '../common.js';

/** Where a bill stands. The legacy `PAYMENT_STATUS` text, in any case, maps to one of these. */
export const BILL_STATUSES = Object.freeze({
  PAID: 'paid',
  PARTLY_PAID: 'partlyPaid',
  PENDING: 'pending',
  OVER_PAID: 'overPaid',
  CANCELLED: 'cancelled',
  /** A legacy "Dummy Bill": saved without counting as a sale. */
  NOT_COUNTED: 'notCounted',
  /** A status the legacy data holds that none of the above covers. */
  OTHER: 'other',
});

/** Ways a bill can be paid; each is a separate amount on the legacy bill. */
export const PAYMENT_METHODS = Object.freeze({
  CASH: 'cash',
  MPESA: 'mpesa',
  CARD: 'card',
  CHEQUE: 'cheque',
  CREDIT: 'credit',
  CREDIT_NOTE: 'creditNote',
});

/** Old-data problems a bill can be flagged with. */
export const BILL_FLAGS = Object.freeze({
  /** The bill has no item lines. */
  NO_ITEMS: 'noItems',
  /** A paid bill whose payments do not add up to its net amount. */
  PAYMENTS_MISMATCH: 'paymentsMismatch',
  /** An M-Pesa payment whose code is not a full 10-character transaction code. */
  SHORT_MPESA_CODE: 'shortMpesaCode',
});

const statusSchema = z.enum(Object.values(BILL_STATUSES));
const methodSchema = z.enum(Object.values(PAYMENT_METHODS));
/** Money on the wire: `"1250.50"`. */
const amount = z.string();
const text = z.string().nullable();

/** Extra list filters of `GET /sales/bills`, besides `q` (bill number, customer name or phone). */
export const billListFiltersShape = Object.freeze({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  cashierId: z.coerce.number().int().positive().optional(),
  paymentMethod: methodSchema.optional(),
  status: statusSchema.optional(),
});

export const billSummarySchema = z.object({
  id: z.number().int(),
  code: text,
  billDate: text,
  createdAt: text,
  customerName: text,
  customerPhone: text,
  cashierId: z.number().int().nullable(),
  cashierName: text,
  lineCount: z.number().int(),
  netAmount: amount,
  paidAmount: amount,
  balance: amount,
  status: statusSchema,
  paymentMethods: z.array(methodSchema),
  flags: z.array(z.enum(Object.values(BILL_FLAGS))),
});

export const billLineSchema = z.object({
  id: z.number().int(),
  itemId: z.number().int().nullable(),
  itemName: text,
  itemCode: text,
  batchNo: text,
  expiryDate: text,
  /** The batch had expired on the bill's date. */
  expiredWhenSold: z.boolean(),
  quantity: z.number(),
  /** Price per unit before VAT. */
  unitPrice: amount,
  /** Label price per unit, VAT included. */
  labelPrice: amount,
  discountPercent: z.number(),
  vatPercent: z.number(),
  taxCode: text,
  amount,
});

export const billPaymentSchema = z.object({
  method: methodSchema,
  amount,
  /** M-Pesa code, card number (last digits), cheque number or credit account, as recorded. */
  reference: text,
});

export const billDetailSchema = billSummarySchema.extend({
  prescriberName: text,
  hospitalName: text,
  prescriptionDate: text,
  remarks: text,
  totals: z.object({
    gross: amount,
    discount: amount,
    vat: amount,
    roundedOff: amount,
    net: amount,
    paid: amount,
    balance: amount,
  }),
  lines: z.array(billLineSchema),
  payments: z.array(billPaymentSchema),
  audit: z.object({
    createdBy: text,
    createdAt: text,
    updatedBy: text,
    updatedAt: text,
  }),
});

export const cashierOptionSchema = z.object({ id: z.number().int(), name: z.string() });
