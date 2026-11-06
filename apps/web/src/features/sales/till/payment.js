import { addMoney, compareMoney, moneyToString, subtractMoney } from '@ihealth/shared/money';
import { MPESA_CODE_PATTERN, PAYMENT_METHODS } from '@ihealth/shared/schemas';

/** How many quick cash amounts to offer besides the exact amount. */
const QUICK_AMOUNTS = 3;
const ZERO = '0.00';

/** Ways to pay at the till, in the order the payment window offers them. */
export const TILL_METHODS = Object.freeze([
  PAYMENT_METHODS.CASH,
  PAYMENT_METHODS.MPESA,
  PAYMENT_METHODS.CARD,
  PAYMENT_METHODS.CHEQUE,
  PAYMENT_METHODS.CREDIT_NOTE,
]);

/** How each way of paying is named in messages. */
const NAMES = Object.freeze({
  [PAYMENT_METHODS.MPESA]: 'M-Pesa',
  [PAYMENT_METHODS.CARD]: 'Card',
  [PAYMENT_METHODS.CHEQUE]: 'The cheque',
  [PAYMENT_METHODS.CREDIT_NOTE]: 'The credit note',
});

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
 * @param {string} date `YYYY-MM-DD`
 * @param {number} months
 * @returns {string} The same day that many months earlier.
 */
export function monthsBefore(date, months) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCMonth(day.getUTCMonth() - months);
  return day.toISOString().slice(0, 10);
}

/**
 * One way of paying, as typed.
 *
 * @typedef {object} PaymentRow
 * @property {string} method
 * @property {string} amount For cash, the cash handed over.
 * @property {string} reference M-Pesa code, card approval code, cheque number or credit note number.
 * @property {string} bankId
 * @property {string} chequeDate `YYYY-MM-DD`
 */

/**
 * @param {string} method
 * @param {string} amount
 * @returns {PaymentRow}
 */
export const newRow = (method, amount) => ({
  method,
  amount,
  reference: '',
  bankId: '',
  chequeDate: '',
});

/**
 * A problem's key: `cash.amount`, `card.reference`, `cheque.bankId`, ...
 *
 * @param {string} method
 * @param {string} field
 * @returns {string}
 */
export const problemKey = (method, field) => `${method}.${field}`;

/**
 * What the payment window shows and sends: what is still to pay, the change, and every problem
 * by field. The server checks all of it again.
 *
 * @param {string} net
 * @param {PaymentRow[]} rows
 * @param {{ today: string, chequeMaxAgeMonths: number }} rules
 * @returns {{ remaining: string, cashDue: string, change: string, problems: Record<string, string>, ready: boolean, payments: Record<string, unknown>[] }}
 */
export function previewPayment(net, rows, { today, chequeMaxAgeMonths }) {
  /** @type {Record<string, string>} */
  const problems = {};
  /**
   * @param {string} method
   * @param {string} field
   * @param {string} message
   */
  const problem = (method, field, message) => {
    problems[problemKey(method, field)] ??= message;
  };

  const amounts = rows.map((row) => parseAmount(row.amount));
  rows.forEach((row, index) => {
    const amount = amounts[index];
    const reference = row.reference.trim();
    if (amount === null) problem(row.method, 'amount', 'Enter an amount such as 1250.50');
    else if (row.method !== PAYMENT_METHODS.CASH && compareMoney(amount, 0) <= 0)
      problem(row.method, 'amount', 'Enter the amount');
    if (row.method === PAYMENT_METHODS.MPESA && !MPESA_CODE_PATTERN.test(reference.toUpperCase()))
      problem(row.method, 'reference', 'Enter all 10 characters of the M-Pesa code');
    if (row.method === PAYMENT_METHODS.CARD && !reference)
      problem(row.method, 'reference', 'Enter the approval code from the card machine slip');
    if (row.method === PAYMENT_METHODS.CREDIT_NOTE && !reference)
      problem(row.method, 'reference', 'Enter the credit note number');
    if (row.method === PAYMENT_METHODS.CHEQUE) {
      if (!reference) problem(row.method, 'reference', 'Enter the cheque number');
      if (!row.bankId) problem(row.method, 'bankId', 'Choose the bank');
      if (!row.chequeDate) problem(row.method, 'chequeDate', 'Enter the date on the cheque');
      else if (row.chequeDate < monthsBefore(today, chequeMaxAgeMonths))
        problem(row.method, 'chequeDate', `Older than ${chequeMaxAgeMonths} months`);
    }
  });

  const nonCash = rows
    .map((row, index) => ({ row, amount: amounts[index] ?? ZERO }))
    .filter(({ row }) => row.method !== PAYMENT_METHODS.CASH);
  const nonCashTotal = addMoney(...nonCash.map(({ amount }) => amount));
  if (compareMoney(nonCashTotal, net) > 0) {
    const last = /** @type {{ row: PaymentRow }} */ (nonCash.at(-1)).row;
    problem(
      last.method,
      'amount',
      nonCash.length === 1
        ? `${NAMES[/** @type {keyof typeof NAMES} */ (last.method)]} can't be more than the bill`
        : "M-Pesa, card, cheque and credit note together can't be more than the bill",
    );
  }

  const cashIndex = rows.findIndex((row) => row.method === PAYMENT_METHODS.CASH);
  const received = cashIndex >= 0 ? (amounts[cashIndex] ?? ZERO) : ZERO;
  const due = subtractMoney(net, nonCashTotal);
  const cashDue = due.isNegative() ? ZERO : moneyToString(due);
  const short = compareMoney(received, cashDue) < 0;
  const remaining = short ? moneyToString(subtractMoney(cashDue, received)) : ZERO;
  if (short && cashIndex >= 0) problem(PAYMENT_METHODS.CASH, 'amount', `${remaining} short`);
  if (!rows.length) problem(PAYMENT_METHODS.CASH, 'amount', 'Choose how they paid');

  return {
    remaining,
    cashDue,
    change: short ? ZERO : moneyToString(subtractMoney(received, cashDue)),
    problems,
    ready: !short && Object.keys(problems).length === 0,
    payments: rows.map((row, index) => ({
      method: row.method,
      amount: amounts[index] ?? row.amount,
      ...(row.method === PAYMENT_METHODS.CASH
        ? {}
        : { reference: row.reference.trim().toUpperCase() }),
      ...(row.method === PAYMENT_METHODS.CHEQUE
        ? { bankId: Number(row.bankId) || undefined, chequeDate: row.chequeDate || undefined }
        : {}),
    })),
  };
}
