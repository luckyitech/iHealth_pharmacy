import { REFUND_METHODS } from '@ihealth/shared/schemas';
import PDFDocument from 'pdfkit';

/** Thermal receipt paper, as the sales receipt: 80 mm wide, bold Helvetica. */
const POINTS_PER_MM = 72 / 25.4;
const PAPER_WIDTH = 80 * POINTS_PER_MM;
const MARGIN = 10;
const FONT_BOLD = 'Helvetica-Bold';
const SIZE = Object.freeze({ name: 9, body: 7 });
/** Height reserved per part, so the one long page can be sized before drawing. */
const HEIGHT = Object.freeze({ header: 120, line: 12, totals: 110, note: 110 });
const RULE_WIDTH = 0.5;

/** How the money went back, as printed. */
const METHOD_LABELS = Object.freeze({
  [REFUND_METHODS.CASH]: 'Cash',
  [REFUND_METHODS.MPESA]: 'M-Pesa',
  [REFUND_METHODS.CREDIT_NOTE]: 'Credit note',
});

/**
 * The receipt of a return, on the till paper: the pharmacy, "SALES RETURN", the return and bill
 * numbers, date and customer, what came back, the refund and how, the reason, who served and who
 * approved; then, for a credit note, the note itself to hand to the customer.
 *
 * @param {import('./returns.js').ReturnDetail} detail
 * @param {{ pharmacy: { name: string, addressLines: string[] }, formatMoney: (value: string) => string, formatDateTime: (value: string) => string, formatDate: (value: string) => string }} context
 * @returns {Promise<Buffer>}
 */
export function renderReturnReceipt(detail, { pharmacy, formatMoney, formatDateTime, formatDate }) {
  const height =
    HEIGHT.header +
    detail.lines.length * HEIGHT.line +
    HEIGHT.totals +
    (detail.creditNote ? HEIGHT.note : 0);
  const doc = new PDFDocument({ size: [PAPER_WIDTH, height], margin: MARGIN });
  const width = PAPER_WIDTH - MARGIN * 2;
  /** @type {Buffer[]} */
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  /**
   * @param {string} text
   * @param {{ align?: 'left' | 'center' | 'right', size?: number }} [options]
   * @returns {void}
   */
  const line = (text, { align = 'left', size = SIZE.body } = {}) =>
    void doc.fontSize(size).text(text, MARGIN, doc.y, { width, align });
  /**
   * @param {string} left
   * @param {string} right
   * @returns {void}
   */
  const pair = (left, right) => {
    const top = doc.y;
    doc.fontSize(SIZE.body).text(left, MARGIN, top, { width: width * 0.62 });
    const after = doc.y;
    doc.text(right, MARGIN + width * 0.62, top, { width: width * 0.38, align: 'right' });
    doc.y = Math.max(after, doc.y);
  };
  const rule = () => {
    doc.moveDown(0.2);
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(MARGIN + width, doc.y)
      .lineWidth(RULE_WIDTH)
      .dash(2, { space: 2 })
      .stroke()
      .undash();
    doc.moveDown(0.3);
  };
  /** @returns {void} */
  const header = () => {
    line(pharmacy.name, { align: 'center', size: SIZE.name });
    for (const address of pharmacy.addressLines) line(address, { align: 'center' });
    rule();
  };

  doc.font(FONT_BOLD);
  header();
  line('SALES RETURN', { align: 'center', size: SIZE.name });
  pair('Return #', detail.code);
  pair('Bill #', detail.billCode ?? '');
  pair('Dt.', formatDateTime(detail.at));
  pair('Cust', detail.customerName ?? 'N/A');
  rule();
  for (const item of detail.lines) {
    pair(
      `${item.itemName ?? ''} x${item.quantity}${item.restocked ? '' : ' (not restocked)'}`,
      formatMoney(item.amount),
    );
  }
  rule();
  pair('Refund', formatMoney(detail.refund));
  pair(
    'As',
    `${METHOD_LABELS[detail.refundMethod]}${detail.mpesaCode ? ` ${detail.mpesaCode}` : ''}`,
  );
  pair('Reason', detail.reason);
  pair('Serv By', detail.requestedBy ?? '');
  pair('Approved', detail.approvedBy);

  const note = detail.creditNote;
  if (note) {
    doc.moveDown(0.8);
    rule();
    header();
    line('CREDIT NOTE', { align: 'center', size: SIZE.name });
    pair('No.', note.code);
    pair('For', note.customerName ?? 'N/A');
    pair('Against bill', note.originalBillCode ?? '');
    rule();
    pair('Amount', formatMoney(note.amount));
    if (note.expiresOn) pair('Valid until', formatDate(note.expiresOn));
    rule();
    line('Show this note, or give its number, to pay for your next purchase.', { align: 'center' });
  }
  doc.end();
  return /** @type {Promise<Buffer>} */ (done);
}
