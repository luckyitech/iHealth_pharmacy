import { z } from 'zod';

import { dateOnlySchema } from '../common.js';

/** What moved a controlled drug's stock, as the register shows it. */
export const REGISTER_ENTRY_KINDS = Object.freeze({
  SOLD: 'sold',
  CANCELLED: 'cancelled',
  RECEIVED: 'received',
  RETURNED_TO_SUPPLIER: 'returnedToSupplier',
  STOCK_COUNT: 'stockCount',
  OTHER: 'other',
});

export const controlledRegisterQuerySchema = z
  .object({
    itemId: z.coerce.number().int().positive({ error: 'Choose a medicine' }),
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((query) => query.from <= query.to, {
    path: ['to'],
    error: 'The end is before the start',
  });

const text = z.string().nullable();

/** A controlled drug the register can be opened for, with what is on hand now. */
export const controlledItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  code: text,
  onHand: z.number(),
});

export const registerEntrySchema = z.object({
  /** When the stock changed, the pharmacy's wall clock (`YYYY-MM-DD HH:MM:SS`). */
  at: z.string(),
  kind: z.enum(Object.values(REGISTER_ENTRY_KINDS)),
  /** The legacy name of the change, shown for changes the register does not name itself. */
  entryType: text,
  batchNo: text,
  billId: z.number().int().nullable(),
  billCode: text,
  /** The supplier's invoice number, for stock received. */
  invoiceNo: text,
  patientName: text,
  patientIdNumber: text,
  doctorName: text,
  quantityIn: z.number(),
  quantityOut: z.number(),
  balance: z.number(),
  by: text,
});

export const controlledRegisterSchema = z.object({
  item: controlledItemSchema,
  from: z.string(),
  to: z.string(),
  opening: z.number(),
  closing: z.number(),
  entries: z.array(registerEntrySchema),
});
