import { z } from 'zod';

import { optionalText } from '../common.js';
import { medicineKindSchema, medicineTypeSchema } from './prescriptions.js';
import { saleQuoteBodySchema } from './quote.js';
import { saleCustomerShape } from './sale.js';

/** Longest search the till sends: a barcode, an item code or part of a name. */
export const MAX_TILL_SEARCH_LENGTH = 50;
/** Shortest customer search, so a single letter does not list everyone. */
export const MIN_CUSTOMER_SEARCH_LENGTH = 2;
/** Length of the note a cashier may add to a held sale. */
const NOTE_LENGTH = 100;

const text = z.string().nullable();

export const batchSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'Type or scan something to search')
    .max(MAX_TILL_SEARCH_LENGTH, `Use at most ${MAX_TILL_SEARCH_LENGTH} characters`),
});

/** A batch the till can sell from, with its label price. Never its cost. */
export const sellableBatchSchema = z.object({
  stockId: z.number().int(),
  itemId: z.number().int().nullable(),
  itemName: text,
  itemCode: text,
  genericName: text,
  batchNo: text,
  barcode: text,
  expiryDate: text,
  expired: z.boolean(),
  available: z.number(),
  /** Price per unit, VAT included. */
  labelPrice: z.string(),
  vatPercent: z.number(),
  /** Prescription-only, controlled or antibiotic; null for everything else. */
  medicineKind: medicineKindSchema,
});

export const batchSearchSchema = z.object({
  batches: z.array(sellableBatchSchema),
  /** The search was a barcode that matched exactly, so the till may add the item straight away. */
  scanned: z.boolean(),
});

export const tillCustomerQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(MIN_CUSTOMER_SEARCH_LENGTH, `Type at least ${MIN_CUSTOMER_SEARCH_LENGTH} characters`)
    .max(MAX_TILL_SEARCH_LENGTH, `Use at most ${MAX_TILL_SEARCH_LENGTH} characters`),
});

/** Just enough to put a registered customer on a bill. */
export const tillCustomerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: text,
});

/** Parking a sale: what was chosen and for whom, never prices. */
export const heldSaleBodySchema = saleQuoteBodySchema.extend({
  ...saleCustomerShape,
  note: optionalText(NOTE_LENGTH),
});

export const heldSaleSummarySchema = z.object({
  id: z.number().int(),
  customerName: text,
  note: text,
  lineCount: z.number().int(),
  /** What the sale came to when it was held; it is priced again on recall. */
  net: z.string(),
  heldBy: text,
  heldAt: z.string(),
});

/** A recalled sale, ready to be put back on the till. */
export const heldSaleSchema = z.object({
  id: z.number().int(),
  customerId: z.number().int().nullable(),
  customerName: text,
  customerPhone: text,
  note: text,
  lines: z.array(
    z.object({
      stockId: z.number().int(),
      quantity: z.number().int(),
      discountPercent: z.number(),
    }),
  ),
});

/** Rules the till shows before the server applies them. */
export const tillSettingsSchema = z.object({
  /** Highest line discount, in percent, a cashier may give without a second person. */
  selfDiscountLimit: z.number(),
  /** Most sales the pharmacy can keep on hold at once. */
  maxHeld: z.number().int(),
  /** Bank notes offered as quick amounts when taking cash, smallest first. */
  quickCashNotes: z.array(z.number()),
  /** Cheques dated longer ago than this are refused. */
  chequeMaxAgeMonths: z.number().int(),
  /** Whether the person at the till may take cheques. */
  canAcceptCheques: z.boolean(),
  /** Minutes after a sale during which its cashier may cancel it alone. */
  cancelAloneMinutes: z.number().int(),
  /** Quick reasons offered in the approval window. */
  approvalReasons: z.array(z.string()),
  /** Quick reasons offered when cancelling a bill. */
  cancelReasons: z.array(z.string()),
  /** The kinds of medicine the till marks, as the pharmacy names them. */
  medicineTypes: z.array(medicineTypeSchema),
  /** Quick reasons offered when goods come back. */
  returnReasons: z.array(z.string()),
  /** Most days after a sale that its goods can be returned. */
  returnDays: z.number().int(),
  /** Whether a controlled drug needs the register's details before it can be paid. */
  controlledDrugRules: z.boolean(),
  /** Largest prescription photo the server keeps, in kilobytes. */
  prescriptionPhotoMaxKb: z.number().int(),
});

/** A bank a cheque can be drawn on. */
export const tillBankSchema = z.object({ id: z.number().int(), name: z.string() });
