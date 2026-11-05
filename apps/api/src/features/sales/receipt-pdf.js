import { formatMoney } from '@ihealth/shared/money';
import PDFDocument from 'pdfkit';

/** Thermal receipt paper, as the legacy receipt: 80 mm wide, in points. */
const POINTS_PER_MM = 72 / 25.4;
const PAPER_WIDTH = 80 * POINTS_PER_MM;
const MARGIN = 8;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const SIZE = Object.freeze({ title: 9, body: 7, small: 6 });
/** Height reserved per part, so the page can be sized before drawing (thermal paper is one long page). */
const HEIGHT = Object.freeze({ header: 120, line: 20, totals: 110, payment: 10, footer: 70 });
/**
 * Item table: share of the text width per column.
 *
 * @type {ReadonlyArray<{ key: string, label: string, share: number, align: 'left' | 'right' }>}
 */
const COLUMNS = Object.freeze([
  { key: 'item', label: 'Item', share: 0.46, align: 'left' },
  { key: 'qty', label: 'Qty', share: 0.12, align: 'right' },
  { key: 'price', label: 'Price', share: 0.2, align: 'right' },
  { key: 'amount', label: 'Amount', share: 0.22, align: 'right' },
]);

const METHOD_LABELS = Object.freeze({
  cash: 'Cash',
  mpesa: 'M-Pesa',
  card: 'Card',
  cheque: 'Cheque',
  credit: 'Credit',
  creditNote: 'Credit note',
});

const STATUS_LABELS = Object.freeze({
  paid: 'Paid',
  partlyPaid: 'Partly paid',
  pending: 'On credit',
  overPaid: 'Over paid',
  cancelled: 'Cancelled',
  notCounted: 'Not counted',
  other: 'Other',
});

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').billDetailSchema>} BillDetail
 * @typedef {{ name: string, addressLines: string[], phone: string | null, email: string | null, taxPin: string | null }} ReceiptPharmacy
 * @typedef {{ locale: string, currency: string }} Region
 */

/**
 * @param {string | null} value Legacy date/time text, `YYYY-MM-DD[ HH:MM:SS]`, in the pharmacy's time.
 * @param {string} locale
 * @returns {string} Formatted as written, without shifting time zones.
 */
function localDateTime(value, locale) {
  if (!value) return '';
  const [date, time = ''] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    ...(time ? { timeStyle: 'short' } : {}),
    timeZone: 'UTC', // hardcode-ok: the text is already local time; UTC only stops a second shift
  }).format(new Date(Date.UTC(year, month - 1, day, hour, minute)));
}

/**
 * The receipt of a bill as a PDF, laid out like the legacy 80 mm receipt: the pharmacy's details,
 * the bill, its items, totals, payments, who served and who printed, and the tax codes used.
 * A reprint says so at the top.
 *
 * @param {BillDetail} bill
 * @param {{ pharmacy: ReceiptPharmacy, region: Region, printedBy: string, printedAt: string, copy?: boolean }} context The receipt is marked "COPY" unless `copy` is false (the first print of a new sale).
 * @returns {Promise<Buffer>}
 */
export function renderReceipt(bill, { pharmacy, region, printedBy, printedAt, copy = true }) {
  const height =
    HEIGHT.header +
    bill.lines.length * HEIGHT.line +
    HEIGHT.totals +
    bill.payments.length * HEIGHT.payment +
    HEIGHT.footer;
  const doc = new PDFDocument({ size: [PAPER_WIDTH, height], margin: MARGIN });
  const width = PAPER_WIDTH - MARGIN * 2;
  const number = new Intl.NumberFormat(region.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  /**
   * @param {string} value
   * @returns {string}
   */
  const currency = (value) => formatMoney(value, region);

  /** @type {Buffer[]} */
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  /**
   * @param {string} text
   * @param {{ bold?: boolean, size?: number, align?: 'left' | 'center' | 'right' }} [options]
   * @returns {unknown}
   */
  const line = (text, { bold = false, size = SIZE.body, align = 'left' } = {}) =>
    doc
      .font(bold ? FONT_BOLD : FONT)
      .fontSize(size)
      .text(text, MARGIN, doc.y, { width, align });

  const rule = () => {
    const y = doc.y + 2;
    doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + width, y)
      .lineWidth(0.5)
      .stroke();
    doc.y = y + 4;
  };

  /**
   * A label on the left and a value on the right, on one line.
   *
   * @param {string} label
   * @param {string} value
   * @param {boolean} [bold]
   */
  const pair = (label, value, bold = false) => {
    const y = doc.y;
    doc.font(bold ? FONT_BOLD : FONT).fontSize(SIZE.body);
    doc.text(label, MARGIN, y, { width: width / 2 });
    doc.text(value, MARGIN + width / 2, y, { width: width / 2, align: 'right' });
    doc.y = Math.max(doc.y, y + SIZE.body + 3);
  };

  // Header: the pharmacy, as on its profile.
  line(pharmacy.name, { bold: true, size: SIZE.title, align: 'center' });
  for (const address of pharmacy.addressLines) line(address, { align: 'center' });
  if (pharmacy.phone) line(`Tel: ${pharmacy.phone}`, { align: 'center' });
  if (pharmacy.email) line(pharmacy.email, { align: 'center' });
  if (pharmacy.taxPin) line(`PIN: ${pharmacy.taxPin}`, { align: 'center' });
  rule();
  line(copy ? 'SALES RECEIPT (COPY)' : 'SALES RECEIPT', { bold: true, align: 'center' });
  pair('Bill #', bill.code ?? String(bill.id), true);
  pair('Date', localDateTime(bill.createdAt ?? bill.billDate, region.locale));
  if (bill.customerName) pair('Customer', bill.customerName);
  if (bill.prescriberName) pair('Prescriber', bill.prescriberName);
  rule();

  // Items.
  const header = doc.y;
  let x = MARGIN;
  doc.font(FONT_BOLD).fontSize(SIZE.body);
  for (const column of COLUMNS) {
    doc.text(column.label, x, header, { width: width * column.share, align: column.align });
    x += width * column.share;
  }
  doc.y = header + SIZE.body + 3;
  rule();
  doc.font(FONT).fontSize(SIZE.body);
  for (const item of bill.lines) {
    const y = doc.y;
    const cells = {
      item: `${item.itemName ?? 'Item'}${item.taxCode ? ` (${item.taxCode})` : ''}`,
      qty: String(item.quantity),
      price: number.format(Number(item.unitPrice)),
      amount: number.format(Number(item.amount)),
    };
    let bottom = y;
    x = MARGIN;
    for (const column of COLUMNS) {
      doc.text(cells[/** @type {keyof typeof cells} */ (column.key)], x, y, {
        width: width * column.share,
        align: column.align,
      });
      bottom = Math.max(bottom, doc.y);
      x += width * column.share;
    }
    doc.y = bottom + 2;
  }
  rule();

  // Totals and payments.
  pair('Items', String(bill.lines.length));
  pair('Total', currency(bill.totals.gross));
  pair('Discount', currency(bill.totals.discount));
  pair('VAT', currency(bill.totals.vat));
  if (Number(bill.totals.roundedOff) !== 0) pair('Rounded off', currency(bill.totals.roundedOff));
  pair('Net', currency(bill.totals.net), true);
  for (const payment of bill.payments) {
    const label = METHOD_LABELS[/** @type {keyof typeof METHOD_LABELS} */ (payment.method)];
    pair(payment.reference ? `${label} (${payment.reference})` : label, currency(payment.amount));
  }
  pair('Paid', currency(bill.totals.paid));
  pair('Balance', currency(bill.totals.balance));
  pair('Status', STATUS_LABELS[/** @type {keyof typeof STATUS_LABELS} */ (bill.status)]);
  rule();

  // Who and when.
  if (bill.cashierName) pair('Served by', bill.cashierName);
  pair('Printed by', printedBy);
  pair('Printed', localDateTime(printedAt, region.locale));
  const codes = [...new Set(bill.lines.map((item) => item.taxCode).filter(Boolean))];
  if (codes.length) {
    const rates = codes.map((code) => {
      const rate = bill.lines.find((item) => item.taxCode === code)?.vatPercent ?? 0;
      return `${code} = ${rate}%`;
    });
    line(`Tax codes: ${rates.join(', ')}`, { size: SIZE.small });
  }
  if (bill.remarks) line(`Remarks: ${bill.remarks}`, { size: SIZE.small });

  doc.end();
  return /** @type {Promise<Buffer>} */ (done);
}
