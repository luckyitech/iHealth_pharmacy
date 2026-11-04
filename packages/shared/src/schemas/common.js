import { z } from 'zod';

const MAX_TEXT_LENGTH = 250;

/** Legacy auto-increment primary key. Accepts `"42"` from path or query strings. */
export const idSchema = z.coerce.number().int().positive();

export const idParamsSchema = z.object({ id: idSchema });

/** Required text: trimmed, and not empty after trimming. */
export const requiredTextSchema = z
  .string()
  .trim()
  .min(1, 'This field is required')
  .max(MAX_TEXT_LENGTH);

/** Optional text: empty strings become `undefined`. */
export const optionalTextSchema = z
  .string()
  .trim()
  .max(MAX_TEXT_LENGTH)
  .optional()
  .transform((value) => (value ? value : undefined));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

const KENYAN_PHONE = /^(?:\+254|254|0)([17]\d{8})$/;

/**
 * Kenyan mobile or landline number in any common form (`0712 345 678`, `+254712345678`, `254712345678`).
 * Output is E.164: `+254712345678`.
 */
export const kenyanPhoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine(
    (value) => KENYAN_PHONE.test(value),
    'Enter a valid Kenyan phone number, e.g. 0712 345 678',
  )
  .transform((value) => `+254${/** @type {RegExpExecArray} */ (KENYAN_PHONE.exec(value))[1]}`);

/** Calendar date without time (`YYYY-MM-DD`), interpreted in the installation's time zone. */
export const dateOnlySchema = z.iso.date('Use the format YYYY-MM-DD');

/** Legacy `char(1)` flags store `'Y'` / `'N'`. */
export const legacyFlagSchema = z.enum(['Y', 'N']);

/**
 * @param {string | null | undefined} flag
 * @returns {boolean}
 */
export function fromLegacyFlag(flag) {
  return flag === 'Y';
}

/**
 * @param {boolean} value
 * @returns {'Y' | 'N'}
 */
export function toLegacyFlag(value) {
  return value ? 'Y' : 'N';
}
