import { z } from 'zod';

import { idSchema, optionalIdSchema, optionalText, requiredText } from '../common.js';
import { storedId, storedText } from './address.js';
import { PRODUCT_KINDS } from './coded-lookup.js';

/** Column lengths of the legacy `items` table. */
const LENGTH = Object.freeze({
  code: 20,
  name: 100,
  description: 2000,
  specification: 100,
  dose: 50,
  temperature: 20,
  pack: 20,
  barcode: 150,
  usage: 2000,
});

/** Largest re-order level or quantity accepted (legacy INT columns). */
export const MAX_REORDER_QUANTITY = 1_000_000;

/** Prefix of the item codes the system generates, as in the legacy app (`IC0000042`). */
export const ITEM_CODE_PREFIX = 'IC';
export const ITEM_CODE_DIGITS = 7;

const requiredId = (/** @type {string} */ message) =>
  z
    .preprocess((value) => (value === '' ? undefined : value), idSchema.optional())
    .pipe(z.number({ error: message }));

const optionalQuantity = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce
    .number()
    .int('Use a whole number')
    .min(0, 'Cannot be negative')
    .max(MAX_REORDER_QUANTITY, `Use at most ${MAX_REORDER_QUANTITY.toLocaleString('en')}`)
    .nullable(),
);

export const itemInputSchema = z.object({
  // Left empty, the code is generated from the record id.
  code: optionalText(LENGTH.code),
  name: requiredText(LENGTH.name),
  // Optional: most legacy items have none, and a required field would block every edit of them.
  description: optionalText(LENGTH.description),
  productKind: z.enum([PRODUCT_KINDS.MEDICAL, PRODUCT_KINDS.NON_MEDICAL]),
  groupId: requiredId('Choose a group'),
  genericNameId: optionalIdSchema,
  formId: requiredId('Choose a dosage form'),
  categoryId: optionalIdSchema,
  specializationId: optionalIdSchema,
  manufacturerId: requiredId('Choose a manufacturer'),
  purchaseUnitId: requiredId('Choose a purchase unit'),
  issueUnitId: requiredId('Choose an issue unit'),
  pack: optionalText(LENGTH.pack),
  taxCategoryId: requiredId('Choose a tax category'),
  barcode: optionalText(LENGTH.barcode),
  strength: optionalText(LENGTH.dose),
  specification: optionalText(LENGTH.specification),
  temperature: optionalText(LENGTH.temperature),
  usage: optionalText(LENGTH.usage),
  reorderLevel: optionalQuantity,
  reorderQuantity: optionalQuantity,
  scheduleCodeId: optionalIdSchema,
  latinCodeId: optionalIdSchema,
});

// Stored records may break today's rules (missing form, tax or manufacturer) and must still be listed.
export const itemSchema = z.object({
  id: z.number().int(),
  active: z.boolean(),
  code: storedText,
  name: z.string(),
  description: storedText,
  productKind: z.enum([PRODUCT_KINDS.MEDICAL, PRODUCT_KINDS.NON_MEDICAL]),
  groupId: storedId,
  groupName: storedText,
  genericNameId: storedId,
  genericName: storedText,
  formId: storedId,
  formName: storedText,
  categoryId: storedId,
  categoryName: storedText,
  specializationId: storedId,
  specializationName: storedText,
  manufacturerId: storedId,
  manufacturerName: storedText,
  purchaseUnitId: storedId,
  purchaseUnitName: storedText,
  issueUnitId: storedId,
  issueUnitName: storedText,
  pack: storedText,
  taxCategoryId: storedId,
  taxCategoryName: storedText,
  barcode: storedText,
  strength: storedText,
  specification: storedText,
  temperature: storedText,
  usage: storedText,
  reorderLevel: storedId,
  reorderQuantity: storedId,
  scheduleCodeId: storedId,
  latinCodeId: storedId,
});

/**
 * The code given to an item saved without one: `IC` + its id, zero-padded (`IC0000042`).
 *
 * @param {number} id
 * @returns {string}
 */
export const generatedItemCode = (id) =>
  `${ITEM_CODE_PREFIX}${String(id).padStart(ITEM_CODE_DIGITS, '0')}`;
