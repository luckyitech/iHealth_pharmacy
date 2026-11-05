import Decimal from 'decimal.js';
import { z } from 'zod';

/** Amounts are kept to two decimal places (cents), as in the legacy system. */
export const MONEY_SCALE = 2;

/**
 * Isolated Decimal constructor so global Decimal settings elsewhere cannot change money maths.
 * Rounding is half-up, as on receipts and in the legacy reports.
 */
const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** @typedef {InstanceType<typeof Money>} MoneyValue */
/** @typedef {MoneyValue | string | number} MoneyInput */

const MONEY_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Parses a money value. Never accepts NaN, Infinity or malformed strings.
 * Numbers are accepted for convenience (legacy DOUBLE columns), but strings are preferred.
 *
 * @param {MoneyInput} value
 * @returns {MoneyValue}
 */
export function toMoney(value) {
  if (value instanceof Money) return value;
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new RangeError(`Invalid money value: ${value}`);
  if (typeof value === 'string' && !MONEY_PATTERN.test(value.trim())) {
    throw new RangeError(`Invalid money value: "${value}"`);
  }
  return new Money(typeof value === 'string' ? value.trim() : value);
}

/**
 * @param {MoneyInput} value
 * @returns {MoneyValue} The value rounded half-up to cents.
 */
export function roundMoney(value) {
  return toMoney(value).toDecimalPlaces(MONEY_SCALE);
}

/**
 * @param {...MoneyInput} values
 * @returns {MoneyValue}
 */
export function addMoney(...values) {
  return values.reduce(
    (/** @type {MoneyValue} */ total, value) => total.plus(toMoney(value)),
    new Money(0),
  );
}

/**
 * @param {MoneyInput} minuend
 * @param {MoneyInput} subtrahend
 * @returns {MoneyValue}
 */
export function subtractMoney(minuend, subtrahend) {
  return toMoney(minuend).minus(toMoney(subtrahend));
}

/**
 * @param {MoneyInput} amount
 * @param {MoneyInput} factor A quantity or rate.
 * @returns {MoneyValue}
 */
export function multiplyMoney(amount, factor) {
  return toMoney(amount).times(toMoney(factor));
}

/**
 * @param {MoneyInput} amount
 * @param {MoneyInput} percent e.g. `16` for 16 %.
 * @returns {MoneyValue}
 */
export function percentOf(amount, percent) {
  return toMoney(amount).times(toMoney(percent)).dividedBy(100);
}

/**
 * @param {MoneyInput} a
 * @param {MoneyInput} b
 * @returns {-1 | 0 | 1}
 */
export function compareMoney(a, b) {
  return /** @type {-1 | 0 | 1} */ (toMoney(a).comparedTo(toMoney(b)));
}

/**
 * Wire format used by the API: a string with exactly two decimals, e.g. `"1250.50"`.
 *
 * @param {MoneyInput} value
 * @returns {string}
 */
export function moneyToString(value) {
  return roundMoney(value).toFixed(MONEY_SCALE);
}

/** @type {Map<string, Intl.NumberFormat>} */
const formatters = new Map();

/**
 * Display format for the installation's currency, e.g. `Ksh 1,250.50` for `{ locale: 'en-KE', currency: 'KES' }`.
 * Goes through a string, so large values never lose precision. Locale and currency come from GET /app-info.
 *
 * @param {MoneyInput} value
 * @param {{ locale: string, currency: string }} region
 * @returns {string}
 */
export function formatMoney(value, { locale, currency }) {
  const key = `${locale}|${currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: MONEY_SCALE,
      maximumFractionDigits: MONEY_SCALE,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(/** @type {`${number}`} */ (moneyToString(value)));
}

/**
 * Accepts `"12.5"`, `12.5` or `"12.50"` and outputs the API wire format `"12.50"`.
 * Values with more than two decimals are rejected rather than rounded silently.
 */
export const moneySchema = z
  .union([z.string().trim(), z.number().finite()])
  // `abort` stops later checks from parsing a malformed value.
  .refine((value) => MONEY_PATTERN.test(String(value)), {
    message: 'Enter an amount such as 1250.50',
    abort: true,
  })
  .refine(
    (value) => toMoney(value).decimalPlaces() <= MONEY_SCALE,
    'Use at most two decimal places',
  )
  .transform((value) => moneyToString(value));

/** Money that must be zero or more. */
export const nonNegativeMoneySchema = moneySchema.refine(
  (value) => compareMoney(value, 0) >= 0,
  'The amount cannot be negative',
);
