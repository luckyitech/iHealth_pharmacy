import { z } from 'zod';

import { medicineKindSchema } from './prescriptions.js';

/** Most stickers printed for one line at a time. */
export const MAX_LABEL_COPIES = 20;
/** Longest dose text on a sticker (the legacy instructions column). */
export const MAX_LABEL_TEXT = 255;

const text = z.string().nullable();

/** One of the legacy app's label codes, e.g. `1t` = "Take one tablet". */
export const labelCodeSchema = z.object({ code: z.string(), text: z.string() });

/** A line of a bill, ready for its dosing sticker. */
export const billLabelLineSchema = z.object({
  lineId: z.number().int(),
  itemName: text,
  batchNo: text,
  expiryDate: text,
  quantity: z.number(),
  medicineKind: medicineKindSchema,
  /** The item's usual instruction, when the legacy app kept one for it. */
  suggestedText: text,
  /** What was last printed for this line, so a reprint is the same. */
  savedText: text,
  savedCopies: z.number().int().nullable(),
});

export const billLabelsSchema = z.object({
  billId: z.number().int(),
  billCode: text,
  lines: z.array(billLabelLineSchema),
  /** Labels were printed for this bill before. */
  printedBefore: z.boolean(),
});

export const printLabelsBodySchema = z.object({
  labels: z
    .array(
      z.object({
        lineId: z.coerce.number().int().positive(),
        text: z.string().trim().max(MAX_LABEL_TEXT, `Use at most ${MAX_LABEL_TEXT} characters`),
        copies: z.coerce
          .number()
          .int()
          .min(0)
          .max(MAX_LABEL_COPIES, `Print at most ${MAX_LABEL_COPIES} at a time`),
      }),
    )
    .min(1, 'Choose the lines to label')
    .refine((labels) => labels.some((label) => label.copies > 0), 'Print at least one sticker')
    .refine(
      (labels) => labels.every((label) => label.copies === 0 || label.text.length > 0),
      'Enter the dose for every sticker printed',
    ),
});
