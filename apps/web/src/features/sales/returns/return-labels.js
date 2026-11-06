import { CREDIT_NOTE_STATES, REFUND_METHODS } from '@ihealth/shared/schemas';

/** How each way of giving the money back is named. */
export const REFUND_LABELS = Object.freeze({
  [REFUND_METHODS.CASH]: 'Cash',
  [REFUND_METHODS.MPESA]: 'M-Pesa',
  [REFUND_METHODS.CREDIT_NOTE]: 'Credit note',
});

/** Where a credit note stands, as shown in the list. */
export const NOTE_STATE_LABELS = Object.freeze({
  [CREDIT_NOTE_STATES.OPEN]: 'Open',
  [CREDIT_NOTE_STATES.USED_UP]: 'Used up',
  [CREDIT_NOTE_STATES.EXPIRED]: 'Expired',
  [CREDIT_NOTE_STATES.CANCELLED]: 'Cancelled',
});
