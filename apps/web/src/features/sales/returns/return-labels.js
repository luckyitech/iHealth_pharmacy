import { REFUND_METHODS } from '@ihealth/shared/schemas';

/** How each way of giving the money back is named. */
export const REFUND_LABELS = Object.freeze({
  [REFUND_METHODS.CASH]: 'Cash',
  [REFUND_METHODS.MPESA]: 'M-Pesa',
  [REFUND_METHODS.CREDIT_NOTE]: 'Credit note',
});
