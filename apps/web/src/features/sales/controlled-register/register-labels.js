import { REGISTER_ENTRY_KINDS } from '@ihealth/shared/schemas';

/** How each kind of stock change is named in the register. */
export const ENTRY_LABELS = Object.freeze({
  [REGISTER_ENTRY_KINDS.SOLD]: 'Sold',
  [REGISTER_ENTRY_KINDS.CANCELLED]: 'Sale cancelled',
  [REGISTER_ENTRY_KINDS.RECEIVED]: 'Received',
  [REGISTER_ENTRY_KINDS.RETURNED_TO_SUPPLIER]: 'Returned to supplier',
  [REGISTER_ENTRY_KINDS.STOCK_COUNT]: 'Stock count',
  [REGISTER_ENTRY_KINDS.OTHER]: 'Other change',
});
