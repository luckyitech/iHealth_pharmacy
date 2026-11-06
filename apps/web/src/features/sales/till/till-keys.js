/**
 * Shortcut keys on the sales screen. F6 is not used: browsers keep it for the address bar.
 */
export const TILL_KEYS = Object.freeze({
  SEARCH: 'F1',
  CUSTOMER: 'F2',
  DISCOUNT: 'F4',
  PRICE: 'F7',
  HOLD: 'F8',
  /** With Shift: the list of held sales. */
  HELD: 'F8',
  PAY: 'F9',
  PRINT: 'p',
});

/** How each shortcut is written in hints. */
export const KEY_LABELS = Object.freeze({
  SEARCH: 'F1',
  CUSTOMER: 'F2',
  DISCOUNT: 'F4',
  PRICE: 'F7',
  HOLD: 'F8',
  HELD: 'Shift F8',
  PAY: 'F9',
  CLEAR: 'Esc',
  PRINT: 'P',
  CONFIRM: 'Enter',
});
