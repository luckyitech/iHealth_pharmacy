import { MAX_LINE_QUANTITY } from '@ihealth/shared/schemas';

/**
 * @typedef {object} TillLine
 * @property {number} stockId
 * @property {number} quantity
 * @property {number} discountPercent
 * @property {string | null} itemName Shown until the server's quote names it.
 * @property {string | null} batchNo
 * @property {string | null} expiryDate
 */

/**
 * @typedef {object} TillCustomer
 * @property {number} [id] A registered customer; absent when a name is only typed on the bill.
 * @property {string | null} name
 * @property {string | null} phone
 */

/**
 * @typedef {object} TillState
 * @property {TillLine[]} lines
 * @property {TillCustomer | null} customer `null` is a walk-in.
 * @property {number} selected Index of the selected line, or -1.
 * @property {string} requestKey Made once per sale, so completing it twice cannot sell twice.
 */

/**
 * @typedef {{ type: 'add', batch: { stockId: number, itemName: string | null, batchNo: string | null, expiryDate: string | null }, quantity: number }
 *   | { type: 'setQuantity', index: number, quantity: number }
 *   | { type: 'step', index: number, delta: number }
 *   | { type: 'setDiscount', index: number, discountPercent: number }
 *   | { type: 'remove', index: number }
 *   | { type: 'select', index: number }
 *   | { type: 'setCustomer', customer: TillCustomer | null }
 *   | { type: 'load', lines: TillLine[], customer: TillCustomer | null }
 *   | { type: 'clear' }} TillAction
 */

const MIN_QUANTITY = 1;

/** Totals before anything is on the sale. */
export const ZERO_TOTALS = Object.freeze({
  gross: '0.00',
  discount: '0.00',
  vat: '0.00',
  subtotal: '0.00',
  roundedOff: '0.00',
  net: '0.00',
});

/**
 * @param {number} quantity
 * @returns {number} A whole number of units the server accepts.
 */
const clampQuantity = (quantity) =>
  Math.min(MAX_LINE_QUANTITY, Math.max(MIN_QUANTITY, Math.trunc(quantity) || MIN_QUANTITY));

/**
 * @returns {TillState} An empty sale for a walk-in customer.
 */
export function newSale() {
  return { lines: [], customer: null, selected: -1, requestKey: crypto.randomUUID() };
}

/**
 * The sale on the till. Pure, so every rule is easy to test; prices are never kept here, they come
 * from the server's quote.
 *
 * @param {TillState} state
 * @param {TillAction} action
 * @returns {TillState}
 */
export function tillReducer(state, action) {
  /**
   * @param {number} index
   * @param {(line: TillLine) => TillLine} change
   * @returns {TillState}
   */
  const updateLine = (index, change) =>
    state.lines[index]
      ? { ...state, lines: state.lines.map((line, at) => (at === index ? change(line) : line)) }
      : state;

  switch (action.type) {
    case 'add': {
      // Scanning the same batch again adds to its line instead of starting a new one.
      const existing = state.lines.findIndex((line) => line.stockId === action.batch.stockId);
      if (existing >= 0) {
        return {
          ...updateLine(existing, (line) => ({
            ...line,
            quantity: clampQuantity(line.quantity + action.quantity),
          })),
          selected: existing,
        };
      }
      const line = {
        ...action.batch,
        quantity: clampQuantity(action.quantity),
        discountPercent: 0,
      };
      return { ...state, lines: [...state.lines, line], selected: state.lines.length };
    }
    case 'setQuantity':
      return updateLine(action.index, (line) => ({
        ...line,
        quantity: clampQuantity(action.quantity),
      }));
    case 'step':
      return updateLine(action.index, (line) => ({
        ...line,
        quantity: clampQuantity(line.quantity + action.delta),
      }));
    case 'setDiscount':
      return updateLine(action.index, (line) => ({
        ...line,
        discountPercent: action.discountPercent,
      }));
    case 'remove': {
      if (!state.lines[action.index]) return state;
      const lines = state.lines.filter((_, at) => at !== action.index);
      return { ...state, lines, selected: Math.min(state.selected, lines.length - 1) };
    }
    case 'select':
      return state.lines.length
        ? { ...state, selected: Math.min(Math.max(action.index, 0), state.lines.length - 1) }
        : state;
    case 'setCustomer':
      return { ...state, customer: action.customer };
    case 'load':
      return {
        ...newSale(),
        lines: action.lines,
        customer: action.customer,
        selected: action.lines.length - 1,
      };
    case 'clear':
      return newSale();
    default:
      return state;
  }
}

/** Typed before a search to sell more than one unit, e.g. `3*` then the scan. */
const QUANTITY_PREFIX = /^\s*(\d{1,6})\s*\*\s*/;

/**
 * Splits what was typed in the search box into a quantity and the search itself.
 *
 * @param {string} text e.g. `3*testamol`
 * @returns {{ quantity: number, query: string }}
 */
export function parseEntry(text) {
  const match = QUANTITY_PREFIX.exec(text);
  if (!match) return { quantity: MIN_QUANTITY, query: text.trim() };
  return { quantity: clampQuantity(Number(match[1])), query: text.slice(match[0].length).trim() };
}

/**
 * @param {TillState} state
 * @returns {{ stockId: number, quantity: number, discountPercent: number }[]} The lines as the API takes them.
 */
export const linesForApi = (state) =>
  state.lines.map(({ stockId, quantity, discountPercent }) => ({
    stockId,
    quantity,
    discountPercent,
  }));

/**
 * @param {TillCustomer | null} customer
 * @returns {{ customerId?: number, customerName?: string | null, customerPhone?: string | null }}
 */
export function customerForApi(customer) {
  if (!customer) return {};
  if (customer.id) return { customerId: customer.id };
  return { customerName: customer.name, customerPhone: customer.phone };
}
