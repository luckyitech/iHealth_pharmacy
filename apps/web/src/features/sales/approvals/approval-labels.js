import { APPROVAL_KINDS, APPROVAL_REASONS } from '@ihealth/shared/schemas';

/** Why a line needs a second person, as the till's flags say it. */
export const APPROVAL_REASON_FLAGS = Object.freeze({
  [APPROVAL_REASONS.DISCOUNT]: 'Discount above the limit · needs approval',
  [APPROVAL_REASONS.PRICE]: 'Price changed · needs approval',
  [APPROVAL_REASONS.BELOW_COST]: 'Below cost · needs approval',
});

/** What was approved, in a sentence's first words. */
export const APPROVAL_REASON_TITLES = Object.freeze({
  [APPROVAL_REASONS.DISCOUNT]: 'Discount',
  [APPROVAL_REASONS.PRICE]: 'Price changed',
  [APPROVAL_REASONS.BELOW_COST]: 'Sold below cost',
});

export const APPROVAL_KIND_LABELS = Object.freeze({
  [APPROVAL_KINDS.SALE]: 'Sale approved',
  [APPROVAL_KINDS.CANCEL]: 'Bill cancelled',
});
