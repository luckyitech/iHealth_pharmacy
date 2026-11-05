import { compareMoney, moneyToString, subtractMoney, toMoney } from '@ihealth/shared/money';
import { MPESA_CODE_PATTERN, PAYMENT_METHODS } from '@ihealth/shared/schemas';

/** How many quick cash amounts to offer besides the exact amount. */
const QUICK_AMOUNTS = 3;
const ZERO = '0.00';

/**
 * @param {string} text An amount as typed, e.g. `1,000` or `250.5`.
 * @returns {string | null} The amount as money text, `"0.00"` when empty, or null when not a number.
 */
export function parseAmount(text) {
  const cleaned = text.replace(/[\s,]/g, '');
  if (!cleaned) return ZERO;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return moneyToString(cleaned);
}

/**
 * Cash amounts a customer is likely to hand over: the exact amount, then the next round amounts
 * in each bank note.
 *
 * @param {string} due
 * @param {readonly number[]} notes Smallest first.
 * @returns {string[]}
 */
export function quickAmounts(due, notes) {
  const exact = moneyToString(due);
  const amounts = new Set([exact]);
  for (const note of notes) {
    if (amounts.size > QUICK_AMOUNTS) break;
    const rounded = Math.ceil(Number(exact) / note) * note;
    if (rounded > Number(exact)) amounts.add(moneyToString(rounded));
  }
  return [...amounts];
}

/**
 * @typedef {object} PaymentEntry
 * @property {boolean} cash
 * @property {boolean} mpesa
 * @property {string} cashText Cash handed over.
 * @property {string} mpesaText M-Pesa amount when paying with both; with M-Pesa alone it is the bill.
 * @property {string} code M-Pesa transaction code.
 */

/**
 * What the payment window shows and sends: the cash still due, the change, and what is missing.
 * The server checks all of it again.
 *
 * @param {string} net
 * @param {PaymentEntry} entry
 * @returns {{ cashDue: string, change: string, problems: Partial<Record<'cash' | 'mpesa' | 'code', string>>, payments: { method: string, amount: string, reference?: string }[] }}
 */
export function previewPayment(net, entry) {
  /** @type {Partial<Record<'cash' | 'mpesa' | 'code', string>>} */
  const problems = {};
  const onlyMpesa = entry.mpesa && !entry.cash;
  const mpesa = onlyMpesa ? moneyToString(net) : entry.mpesa ? parseAmount(entry.mpesaText) : ZERO;
  const cash = entry.cash ? parseAmount(entry.cashText) : ZERO;

  if (mpesa === null) problems.mpesa = 'Enter the M-Pesa amount';
  else if (entry.mpesa && compareMoney(mpesa, net) > 0)
    problems.mpesa = 'M-Pesa cannot be more than the bill';
  if (entry.mpesa && !MPESA_CODE_PATTERN.test(entry.code.trim().toUpperCase()))
    problems.code = 'Enter all 10 characters of the M-Pesa code';
  if (cash === null) problems.cash = 'Enter the cash received';

  const cashDue =
    mpesa === null || problems.mpesa
      ? moneyToString(net)
      : moneyToString(subtractMoney(net, mpesa));
  const received = cash ?? ZERO;
  const short = compareMoney(received, cashDue) < 0;
  if (!problems.cash && short) {
    const missing = moneyToString(subtractMoney(cashDue, received));
    if (entry.cash) problems.cash = `${missing} short`;
    else if (!problems.mpesa) problems.mpesa = `${missing} short of the bill`;
  }
  if (!entry.cash && !entry.mpesa) problems.cash = 'Choose how they paid';

  /** @type {{ method: string, amount: string, reference?: string }[]} */
  const payments = [];
  if (entry.cash) payments.push({ method: PAYMENT_METHODS.CASH, amount: received });
  if (entry.mpesa && mpesa !== null)
    payments.push({
      method: PAYMENT_METHODS.MPESA,
      amount: mpesa,
      reference: entry.code.trim().toUpperCase(),
    });

  return {
    cashDue,
    change: short ? ZERO : moneyToString(subtractMoney(received, cashDue)),
    problems,
    payments,
  };
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export const isPositive = (value) => toMoney(value).greaterThan(0);
