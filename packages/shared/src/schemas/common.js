import { z } from 'zod';

const MAX_TEXT_LENGTH = 250;

/** Legacy auto-increment primary key. Accepts `"42"` from path or query strings. */
export const idSchema = z.coerce.number().int().positive();

export const idParamsSchema = z.object({ id: idSchema });

/**
 * Required text: trimmed, and not empty after trimming.
 *
 * @param {number} [max] Length of the legacy column.
 * @returns The Zod schema.
 */
export const requiredText = (max = MAX_TEXT_LENGTH) =>
  z.string().trim().min(1, 'This field is required').max(max, `Use at most ${max} characters`);

/**
 * Optional text for a nullable legacy column: an empty value becomes `null`, so it also clears the
 * column on update (an absent key leaves it unchanged).
 *
 * @param {number} [max] Length of the legacy column.
 * @returns The Zod schema.
 */
export const optionalText = (max = MAX_TEXT_LENGTH) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .nullish()
    .transform((value) => value || null);

/** Required text of up to 250 characters. */
export const requiredTextSchema = requiredText();

/** Optional text of up to 250 characters; empty becomes `null`. */
export const optionalTextSchema = optionalText();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'));

/**
 * Optional email for a nullable column. Any valid address is accepted (the legacy forms wrongly
 * required ".com").
 *
 * @param {number} [max] Length of the legacy column.
 * @returns The Zod schema.
 */
export const optionalEmail = (max = MAX_TEXT_LENGTH) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(max, `Use at most ${max} characters`)
    .refine(
      (value) => value === '' || z.email().safeParse(value).success,
      'Enter a valid email address',
    )
    .nullish()
    .transform((value) => value || null);

/** Optional reference to another record (a select): empty becomes `null`. */
export const optionalIdSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().int().positive().nullable(),
);

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
