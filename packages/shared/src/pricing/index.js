import { MONEY_SCALE, moneyToString, toMoney } from '../money/index.js';

/**
 * How a sale is priced. One implementation for the till (to show totals as items are added) and
 * the API (which recalculates everything and never trusts the till's numbers).
 *
 * The rules follow the legacy billing screen, so new bills match old ones:
 * - the label price (MRP) includes VAT; the unit price before VAT is label / (1 + VAT%);
 * - the discount is a percentage of the line before VAT; VAT is charged on what remains;
 * - a line's amount is rounded to cents; the bill's net is the unrounded sum of its lines rounded to
 *   the rounding step (whole shillings in the legacy app), and the difference is "rounded off".
 * Unlike the legacy screen, money is exact decimal arithmetic, never floating point.
 *
 * @typedef {import('../money/index.js').MoneyInput} MoneyInput
 * @typedef {import('../money/index.js').MoneyValue} MoneyValue
 */

const HUNDRED = 100;
/** Unit prices keep more decimals than money, so line amounts are not rounded twice. */
const UNIT_PRICE_SCALE = 4;

/**
 * @typedef {object} LineInput
 * @property {MoneyInput} labelPrice Price per unit, VAT included (the batch's MRP).
 * @property {number} quantity Units sold.
 * @property {number} [discountPercent] 0–100, of the line before VAT.
 * @property {number} [vatPercent] e.g. 16.
 * @property {MoneyInput | null} [unitCost] Purchase price per unit, before VAT.
 * @property {number} [costDiscountPercent] The supplier's discount on that purchase price.
 */

/**
 * @typedef {object} PricedLine
 * @property {string} unitPrice Price per unit before VAT, 4 decimals.
 * @property {string} gross Quantity × unit price, before discount and VAT.
 * @property {string} discount
 * @property {string} vat
 * @property {string} amount What the customer pays for the line, rounded to cents.
 * @property {string | null} profit (Price after discount − cost after supplier discount) × quantity, before VAT; null without a cost.
 * @property {boolean} belowCost Sold for less than it cost.
 */

/**
 * @param {number | undefined} percent
 * @returns {MoneyValue} The percentage as a fraction, e.g. 16 -> 0.16.
 */
const fraction = (percent) => toMoney(percent ?? 0).div(HUNDRED);

/**
 * Exact values for one line, before any display rounding.
 *
 * @param {LineInput} line
 * @returns {{ unitPrice: MoneyValue, gross: MoneyValue, discount: MoneyValue, vat: MoneyValue, net: MoneyValue, profit: MoneyValue | null }}
 */
function exactLine({
  labelPrice,
  quantity,
  discountPercent,
  vatPercent,
  unitCost,
  costDiscountPercent,
}) {
  const unitPrice = toMoney(labelPrice).div(fraction(vatPercent).plus(1));
  const gross = unitPrice.times(quantity);
  const discount = gross.times(fraction(discountPercent));
  const afterDiscount = gross.minus(discount);
  const vat = afterDiscount.times(fraction(vatPercent));
  const cost =
    unitCost === null || unitCost === undefined
      ? null
      : toMoney(unitCost)
          .times(toMoney(1).minus(fraction(costDiscountPercent)))
          .times(quantity);
  return {
    unitPrice,
    gross,
    discount,
    vat,
    net: afterDiscount.plus(vat),
    profit: cost === null ? null : afterDiscount.minus(cost),
  };
}

/**
 * @param {MoneyValue} value
 * @returns {string}
 */
const cents = (value) => moneyToString(value.toDecimalPlaces(MONEY_SCALE));

/**
 * @param {LineInput} line
 * @returns {PricedLine}
 */
export function priceLine(line) {
  const exact = exactLine(line);
  return {
    unitPrice: exact.unitPrice.toDecimalPlaces(UNIT_PRICE_SCALE).toFixed(UNIT_PRICE_SCALE),
    gross: cents(exact.gross),
    discount: cents(exact.discount),
    vat: cents(exact.vat),
    amount: cents(exact.net),
    profit: exact.profit === null ? null : cents(exact.profit),
    belowCost: exact.profit !== null && exact.profit.isNegative() && !exact.profit.isZero(),
  };
}

/**
 * @typedef {object} PricedBill
 * @property {PricedLine[]} lines
 * @property {string} gross Lines before discount, VAT included (the legacy "total").
 * @property {string} discount
 * @property {string} vat
 * @property {string} subtotal Unrounded sum of the lines, to cents.
 * @property {string} roundedOff Net − subtotal.
 * @property {string} net What the customer pays.
 * @property {string | null} profit Sum of the lines' profit; null when any line has no cost.
 * @property {number} quantity Units on the bill.
 */

/**
 * @param {readonly LineInput[]} lines
 * @param {{ roundingStep: MoneyInput }} options `roundingStep` e.g. 1 (whole shillings) or 0.05.
 * @returns {PricedBill}
 */
export function priceBill(lines, { roundingStep }) {
  const exact = lines.map(exactLine);
  /**
   * @param {(line: ReturnType<typeof exactLine>) => MoneyValue} pick
   * @returns {MoneyValue}
   */
  const sum = (pick) => exact.reduce((total, line) => total.plus(pick(line)), toMoney(0));
  const subtotal = sum((line) => line.net);
  const step = toMoney(roundingStep);
  // Half up, as Math.round did for the positive totals of the legacy app.
  const net = step.isZero() ? subtotal : subtotal.div(step).toDecimalPlaces(0).times(step);
  const profits = exact.map((line) => line.profit);
  return {
    lines: lines.map(priceLine),
    // As the legacy screen: the net plus the discount it took off.
    gross: cents(sum((line) => line.net.plus(line.discount))),
    discount: cents(sum((line) => line.discount)),
    vat: cents(sum((line) => line.vat)),
    subtotal: cents(subtotal),
    roundedOff: cents(net.minus(subtotal)),
    net: cents(net),
    profit: profits.every((profit) => profit !== null)
      ? cents(
          profits.reduce(
            (total, profit) => total.plus(/** @type {MoneyValue} */ (profit)),
            toMoney(0),
          ),
        )
      : null,
    quantity: lines.reduce((total, line) => total + line.quantity, 0),
  };
}
