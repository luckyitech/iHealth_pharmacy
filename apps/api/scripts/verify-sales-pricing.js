/**
 * Recalculates past bills with the shared pricing engine and reports how many match what the
 * legacy app saved: line amounts, bill nets, discounts and VAT. Read-only; prints counts only.
 *
 *   npm run db:verify-sales-pricing            (last 12 months)
 *   npm run db:verify-sales-pricing -- 3       (last 3 months)
 *
 * Run it on a copy of production before switching over. It refuses anything but the Docker
 * development database.
 */
import { priceBill, priceLine } from '@ihealth/shared/pricing';

import { connectToDevDatabase } from './lib/dev-db.js';

const DEFAULT_MONTHS = 12;
/** A cent either way is the legacy app's floating point, not a different rule. */
const TOLERANCE = 0.011;

const months = Number(process.argv[2] ?? DEFAULT_MONTHS);
const roundingStep = Number(process.env.SALES_ROUNDING_STEP ?? 1);

/**
 * @param {unknown} value
 * @returns {number}
 */
const num = (value) => Number(value ?? 0);

/**
 * @param {number} part
 * @param {number} whole
 * @returns {string}
 */
const share = (part, whole) => `${part} of ${whole} (${((100 * part) / (whole || 1)).toFixed(2)}%)`;

const { connection } = await connectToDevDatabase();
try {
  /** @type {Record<string, unknown>[]} */
  const lines = await connection.query(
    `SELECT i.BILL_ID AS billId, i.SALE_QTY AS quantity, i.UNIT_SALE_PRICE AS unitPrice,
       i.DISCOUNT_PERCENTAGE AS discountPercent, i.VAT AS vatPercent, i.SALE_AMOUNT AS amount
     FROM sales_items i JOIN sales s ON s.BILL_ID = i.BILL_ID
     WHERE s.CREATION_TS >= DATE_SUB((SELECT MAX(CREATION_TS) FROM sales), INTERVAL ? MONTH)
       AND s.PAYMENT_STATUS <> 'Cancel' AND i.SALE_QTY IS NOT NULL AND i.UNIT_SALE_PRICE IS NOT NULL`,
    [months],
  );
  /** @type {Record<string, unknown>[]} */
  const bills = await connection.query(
    `SELECT BILL_ID AS billId, NET_AMOUNT AS net, ROUNDED_OFF AS roundedOff,
       OVERALL_DISCOUNT AS discount, VAT_AMT AS vat
     FROM sales
     WHERE CREATION_TS >= DATE_SUB((SELECT MAX(CREATION_TS) FROM sales), INTERVAL ? MONTH)
       AND PAYMENT_STATUS <> 'Cancel'`,
    [months],
  );

  /** @type {Map<unknown, import('@ihealth/shared/pricing').LineInput[]>} */
  const byBill = new Map();
  let linesMatching = 0;
  for (const line of lines) {
    const vatPercent = num(line.vatPercent);
    // The legacy line keeps the price before VAT; the label price is that plus VAT.
    const input = {
      labelPrice: (num(line.unitPrice) * (1 + vatPercent / 100)).toFixed(6),
      quantity: num(line.quantity),
      discountPercent: num(line.discountPercent),
      vatPercent,
    };
    if (Math.abs(Number(priceLine(input).amount) - num(line.amount)) <= TOLERANCE) linesMatching++;
    byBill.set(line.billId, [...(byBill.get(line.billId) ?? []), input]);
  }

  let compared = 0;
  let netMatching = 0;
  let discountMatching = 0;
  let vatMatching = 0;
  for (const bill of bills) {
    const items = byBill.get(bill.billId);
    if (!items) continue;
    compared++;
    const priced = priceBill(items, { roundingStep });
    // A round-off the cashier typed was added on top of the rounded net.
    const expected = Number(priced.net) + num(bill.roundedOff);
    if (Math.abs(expected - num(bill.net)) <= TOLERANCE) netMatching++;
    if (Math.abs(Number(priced.discount) - num(bill.discount)) <= TOLERANCE) discountMatching++;
    if (Math.abs(Number(priced.vat) - num(bill.vat)) <= TOLERANCE) vatMatching++;
  }

  process.stdout.write(
    [
      `Last ${months} months, rounding step ${roundingStep}:`,
      `  line amounts match: ${share(linesMatching, lines.length)}`,
      `  bill nets match:    ${share(netMatching, compared)}`,
      `  discounts match:    ${share(discountMatching, compared)}`,
      `  VAT matches:        ${share(vatMatching, compared)}`,
      '',
    ].join('\n'),
  );
} finally {
  await connection.end();
}
