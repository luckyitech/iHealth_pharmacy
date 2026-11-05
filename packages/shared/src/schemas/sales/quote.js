import { z } from 'zod';

/** Most lines one sale can have. */
export const MAX_SALE_LINES = 200;
/** Most units of one batch on one line. */
export const MAX_LINE_QUANTITY = 100_000;

/** Problems the till should show on a line before the sale is completed. */
export const LINE_WARNINGS = Object.freeze({
  /** The batch's expiry date has passed. */
  EXPIRED: 'expired',
  /** More units than the batch has on hand. */
  INSUFFICIENT_STOCK: 'insufficientStock',
});

export const saleQuoteLineInputSchema = z.object({
  stockId: z.coerce.number().int().positive(),
  quantity: z.coerce
    .number({ error: 'Enter a quantity' })
    .int('Use whole units')
    .min(1, 'Enter at least 1')
    .max(MAX_LINE_QUANTITY, `Use at most ${MAX_LINE_QUANTITY}`),
  discountPercent: z.coerce
    .number()
    .min(0, 'Cannot be negative')
    .max(100, 'Use at most 100')
    .default(0),
});

/** What the till sends to price a sale: only what was chosen, never prices or totals. */
export const saleQuoteBodySchema = z.object({
  lines: z
    .array(saleQuoteLineInputSchema)
    .min(1, 'Add at least one item')
    .max(MAX_SALE_LINES, `A sale can have at most ${MAX_SALE_LINES} lines`),
});

const amount = z.string();
const text = z.string().nullable();

export const saleQuoteLineSchema = z.object({
  stockId: z.number().int(),
  itemId: z.number().int().nullable(),
  itemName: text,
  itemCode: text,
  batchNo: text,
  expiryDate: text,
  /** Units on hand in the batch. */
  available: z.number(),
  quantity: z.number().int(),
  discountPercent: z.number(),
  vatPercent: z.number(),
  taxCode: text,
  /** Price per unit, VAT included, from the batch. */
  labelPrice: amount,
  /** Price per unit before VAT. */
  unitPrice: z.string(),
  gross: amount,
  discount: amount,
  vat: amount,
  amount,
  warnings: z.array(z.enum(Object.values(LINE_WARNINGS))),
});

export const saleQuoteSchema = z.object({
  lines: z.array(saleQuoteLineSchema),
  totals: z.object({
    gross: amount,
    discount: amount,
    vat: amount,
    subtotal: amount,
    roundedOff: amount,
    net: amount,
  }),
  quantity: z.number().int(),
});
