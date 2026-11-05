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

/**
 * Required reference to another record (a select): empty or missing gives `message`.
 *
 * @param {string} message e.g. "Choose a group"
 * @returns The Zod schema.
 */
export const requiredIdSchema = (message) =>
  z
    .preprocess(
      (value) => (value === '' || value === null ? undefined : value),
      idSchema.optional(),
    )
    .pipe(z.number({ error: message }));

/** Calendar date without time (`YYYY-MM-DD`), interpreted in the installation's time zone. */
export const dateOnlySchema = z.iso.date('Use the format YYYY-MM-DD');

/** Oldest calendar date accepted in forms (birth or joining dates). */
export const EARLIEST_DATE = '1900-01-01';

/**
 * A calendar date field (`YYYY-MM-DD`); empty becomes `null` when optional.
 *
 * @param {{ label: string, required?: boolean, notInFuture?: boolean }} options `label` names it in messages, e.g. "date of birth".
 * @returns The Zod schema.
 */
export function calendarDateSchema({ label, required = false, notInFuture = false }) {
  let date = dateOnlySchema.refine((value) => value >= EARLIEST_DATE, `Enter a real ${label}`);
  if (notInFuture)
    date = date.refine(
      (value) => new Date(value) <= new Date(),
      `The ${label} cannot be in the future`,
    );
  if (required) {
    return z
      .preprocess((value) => (value === '' || value === null ? undefined : value), date.optional())
      .pipe(z.string({ error: `Enter the ${label}` }));
  }
  return z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    date.nullable(),
  );
}

/** Digits, spaces, dashes and an optional leading +, as phone numbers are typed. */
const PHONE_PATTERN = /^\+?[\d\s-]{6,20}$/;

/**
 * Required phone number, saved without spaces or dashes (like the stored numbers), so a search by
 * number finds it.
 *
 * @param {number} max Length of the legacy column.
 * @returns The Zod schema.
 */
export const requiredPhone = (max) =>
  requiredText(max)
    .regex(PHONE_PATTERN, 'Enter a phone number, e.g. 0712 345 678')
    .transform((value) => value.replace(/[\s-]/g, ''));

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
