import { z } from 'zod';

import { calendarDateSchema, requiredIdSchema } from '../common.js';
import { storedId, storedText } from './address.js';

/** Supplier priorities the legacy form offers: 1 is the supplier bought from first. */
export const SUPPLIER_PRIORITIES = Object.freeze([1, 2, 3]);

/** Old-data problems a link can be filtered by. */
export const ITEM_SUPPLIER_ISSUES = Object.freeze({
  /** The same item and supplier are linked more than once. */
  DUPLICATE: 'duplicate',
  /** The item or the supplier no longer exists. */
  MISSING_RECORD: 'missingRecord',
});

/** Highest rate per pack accepted. */
export const MAX_UNIT_RATE = 10_000_000;
/** Highest discount, in percent. */
export const MAX_DISCOUNT_PERCENT = 100;
/** Decimal places the legacy form allowed for the rate and the discount. */
const DECIMALS = 2;
const DECIMAL_STEP = 10 ** -DECIMALS;

/**
 * @param {number} value
 * @returns {boolean} The value has at most two decimal places.
 */
const hasCents = (value) =>
  Math.abs(Math.round(value / DECIMAL_STEP) * DECIMAL_STEP - value) < 1e-9;

/**
 * @param {{ label: string, max: number }} options
 * @returns A required amount between 0 and `max` with at most two decimal places.
 */
const requiredAmount = ({ label, max }) =>
  z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce
      .number({ error: `Enter the ${label}` })
      .min(0, 'Cannot be negative')
      .max(max, `Use at most ${max}`)
      .refine(hasCents, 'Use at most two decimal places'),
  );

export const itemSupplierInputSchema = z.object({
  itemId: requiredIdSchema('Choose an item'),
  supplierId: requiredIdSchema('Choose a supplier'),
  priority: z.coerce
    .number({ error: 'Choose a priority' })
    .int()
    .refine((value) => SUPPLIER_PRIORITIES.includes(value), 'Choose a priority'),
  unitRate: requiredAmount({ label: 'rate per pack', max: MAX_UNIT_RATE }),
  discountPercent: requiredAmount({ label: 'discount', max: MAX_DISCOUNT_PERCENT }),
  validUntil: calendarDateSchema({ label: 'validity date', required: true }),
});

export const itemSupplierSchema = z.object({
  id: z.number().int(),
  active: z.boolean(),
  itemId: storedId,
  itemName: storedText,
  itemCode: storedText,
  supplierId: storedId,
  supplierName: storedText,
  // Old links may have no priority, or a discount above 100%; they are shown as stored.
  priority: storedId,
  unitRate: z.number(),
  discountPercent: z.number(),
  validUntil: z.string().nullable(),
  /** Another link joins the same item and supplier. */
  duplicate: z.boolean(),
  /** The linked item no longer exists. */
  itemMissing: z.boolean(),
  /** The linked supplier no longer exists. */
  supplierMissing: z.boolean(),
});
