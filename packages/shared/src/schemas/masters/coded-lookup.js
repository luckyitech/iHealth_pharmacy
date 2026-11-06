import { z } from 'zod';

import { optionalIdSchema, optionalText, requiredText } from '../common.js';

/** Legacy `MEDICAL_OR_NON_MEDICAL`: 'M' or 'N'. */
export const PRODUCT_KINDS = Object.freeze({ MEDICAL: 'medical', NON_MEDICAL: 'nonMedical' });
const productKindSchema = z.enum([PRODUCT_KINDS.MEDICAL, PRODUCT_KINDS.NON_MEDICAL]);

/**
 * @typedef {object} CodedLookupOptions
 * @property {number} codeMax
 * @property {number} nameMax
 * @property {boolean} [description] Has a free-text description.
 * @property {boolean} [productKind] Has the medical / non-medical flag.
 * @property {boolean} [itemGroup] Belongs to an item group (generic names).
 * @property {boolean} [marginPercent] Has a default margin % (item categories).
 */

/** Largest default margin accepted, in percent. */
export const MAX_MARGIN_PERCENT = 1000;

/**
 * Input and stored schemas for the small coded lookups of the item master (category, form, group,
 * generic name, specialization, unit of measure): a code, a name, and a few optional extras.
 *
 * @param {CodedLookupOptions} options
 * @returns The input schema (create; update = partial) and the stored-record schema.
 */
export function codedLookupSchemas({
  codeMax,
  nameMax,
  description,
  productKind,
  itemGroup,
  marginPercent,
}) {
  const inputSchema = z.object({
    code: requiredText(codeMax),
    name: requiredText(nameMax),
    ...(description ? { description: optionalText(2000) } : {}),
    ...(productKind ? { productKind: productKindSchema } : {}),
    ...(itemGroup ? { itemGroupId: optionalIdSchema } : {}),
    ...(marginPercent
      ? {
          marginPercent: z.preprocess(
            (value) => (value === '' || value === undefined ? null : value),
            z.coerce
              .number()
              .int('Use a whole number')
              .min(0, 'The margin cannot be negative')
              .max(MAX_MARGIN_PERCENT, `Use at most ${MAX_MARGIN_PERCENT}`)
              .nullable(),
          ),
        }
      : {}),
  });
  // Stored records may break today's rules (empty names, duplicate codes) and must still be listed.
  const itemSchema = z.object({
    id: z.number().int(),
    active: z.boolean(),
    code: z.string(),
    name: z.string(),
    ...(description ? { description: z.string().nullable() } : {}),
    ...(productKind ? { productKind: productKindSchema } : {}),
    ...(itemGroup
      ? { itemGroupId: z.number().int().nullable(), itemGroupName: z.string().nullable() }
      : {}),
    ...(marginPercent ? { marginPercent: z.number().int().nullable() } : {}),
  });
  return { inputSchema, itemSchema };
}

/** Column lengths of the legacy tables. */
export const ITEM_LOOKUPS = Object.freeze({
  categories: codedLookupSchemas({
    codeMax: 20,
    nameMax: 100,
    description: true,
    productKind: true,
    marginPercent: true,
  }),
  forms: codedLookupSchemas({ codeMax: 20, nameMax: 100, productKind: true }),
  groups: codedLookupSchemas({ codeMax: 20, nameMax: 100, description: true, productKind: true }),
  genericNames: codedLookupSchemas({
    codeMax: 20,
    nameMax: 500,
    productKind: true,
    itemGroup: true,
  }),
  specializations: codedLookupSchemas({ codeMax: 20, nameMax: 100, description: true }),
  unitsOfMeasure: codedLookupSchemas({ codeMax: 20, nameMax: 100 }),
});

/** Banks a cheque can be drawn on: a short list kept under Masters. */
export const BANK_SCHEMAS = codedLookupSchemas({ codeMax: 20, nameMax: 100 });
