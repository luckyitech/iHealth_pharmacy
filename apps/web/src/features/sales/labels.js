/**
 * Names of sales figures and columns, as the legacy billing screens called them, so staff see the
 * words they already know. One place, so every screen says the same thing.
 */
export const SALES_LABELS = Object.freeze({
  BILL_CODE: 'Bill Code',
  BILL_DATE: 'Bill Date',
  CUSTOMER_NAME: 'Customer Name',
  SALES_PERSON: 'Sales Person Name',
  PAYMENT_STATUS: 'Payment Status',
  BATCH_NO: 'Batch No',
  QTY: 'Qty',
  /** Shelf price, VAT included. */
  PRICE_WITH_VAT: 'S.Price (Inc)',
  /** Price before VAT. */
  PRICE_BEFORE_VAT: 'S Price',
  SALE_DISCOUNT: 'Sale Disc %',
  TAX: 'Tax',
  /** A line's amount, or (in the totals) the bill before discount. */
  TOTAL_AMOUNT: 'Total Amount',
  TOTAL_ITEMS: 'Total Items',
  TOTAL_QTY: 'Total Qty',
  TOTAL_DISCOUNT: 'Total Discount',
  VAT: 'VAT',
  ROUND_OFF: 'Round off',
  NET_AMOUNT: 'Net Amount',
  AMOUNT_PAID: 'Amount Paid',
  BALANCE: 'Balance',
  /** New: what came in at the counter for a bill (asked for in place of Net Amount on the list). */
  TOTAL_PAID: 'Total paid',
});
