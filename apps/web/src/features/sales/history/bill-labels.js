import { BILL_FLAGS, BILL_STATUSES, PAYMENT_METHODS } from '@ihealth/shared/schemas';

/** What people call each bill status. */
export const STATUS_LABELS = Object.freeze({
  [BILL_STATUSES.PAID]: 'Paid',
  [BILL_STATUSES.PARTLY_PAID]: 'Partly paid',
  [BILL_STATUSES.PENDING]: 'On credit',
  [BILL_STATUSES.OVER_PAID]: 'Over paid',
  [BILL_STATUSES.CANCELLED]: 'Cancelled',
  [BILL_STATUSES.NOT_COUNTED]: 'Not counted',
  [BILL_STATUSES.OTHER]: 'Other',
});

/** Statuses that need a second look: money still owed, or a bill that does not count. */
export const ATTENTION_STATUSES = Object.freeze(
  /** @type {Set<string>} */ (
    new Set([BILL_STATUSES.PARTLY_PAID, BILL_STATUSES.PENDING, BILL_STATUSES.OVER_PAID])
  ),
);

export const METHOD_LABELS = Object.freeze({
  [PAYMENT_METHODS.CASH]: 'Cash',
  [PAYMENT_METHODS.MPESA]: 'M-Pesa',
  [PAYMENT_METHODS.CARD]: 'Card',
  [PAYMENT_METHODS.CHEQUE]: 'Cheque',
  [PAYMENT_METHODS.CREDIT]: 'Credit',
  [PAYMENT_METHODS.CREDIT_NOTE]: 'Credit note',
});

/** Old-data problems: a short label for the list, a sentence for the bill's details. */
export const FLAG_LABELS = Object.freeze({
  [BILL_FLAGS.NO_ITEMS]: {
    label: 'No items',
    description: 'This bill was saved without any items, so it was probably interrupted.',
  },
  [BILL_FLAGS.PAYMENTS_MISMATCH]: {
    label: "Payments don't add up",
    description: 'It is marked paid, but its payments do not add up to the net amount.',
  },
  [BILL_FLAGS.SHORT_MPESA_CODE]: {
    label: 'Short M-Pesa code',
    description:
      'The M-Pesa code is not a full 10-character transaction code, so it cannot be checked against Safaricom.',
  },
});

/**
 * @param {Record<string, string>} labels
 * @returns {{ value: string, label: string }[]}
 */
export const optionsOf = (labels) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
