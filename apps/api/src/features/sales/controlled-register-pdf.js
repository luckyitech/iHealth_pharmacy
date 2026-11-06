import { REGISTER_ENTRY_KINDS } from '@ihealth/shared/schemas';
import PDFDocument from 'pdfkit';

/** A4 on its side, so the register's columns fit; in points. */
const PAGE = Object.freeze({ size: 'A4', layout: 'landscape', margin: 36 });
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const SIZE = Object.freeze({ title: 14, heading: 9, body: 8 });
const ROW_GAP = 4;
/** Space between columns, so a right-aligned number never runs into the next column. */
const COLUMN_GAP = 10;
const RULE_WIDTH = 0.5;

/** How each kind of change is named on paper. */
const KIND_LABELS = Object.freeze({
  [REGISTER_ENTRY_KINDS.SOLD]: 'Sold',
  [REGISTER_ENTRY_KINDS.CANCELLED]: 'Sale cancelled',
  [REGISTER_ENTRY_KINDS.RECEIVED]: 'Received',
  [REGISTER_ENTRY_KINDS.RETURNED_TO_SUPPLIER]: 'Returned to supplier',
  [REGISTER_ENTRY_KINDS.STOCK_COUNT]: 'Stock count',
  [REGISTER_ENTRY_KINDS.OTHER]: 'Other change',
});

/**
 * Columns as shares of the page width.
 *
 * @type {ReadonlyArray<{ label: string, share: number, align: 'left' | 'right' }>}
 */
const COLUMNS = Object.freeze([
  { label: 'Date', share: 0.1, align: 'left' },
  { label: 'Entry', share: 0.11, align: 'left' },
  { label: 'Bill / invoice', share: 0.12, align: 'left' },
  { label: 'Batch', share: 0.08, align: 'left' },
  { label: 'Patient', share: 0.15, align: 'left' },
  { label: 'ID number', share: 0.08, align: 'left' },
  { label: 'Doctor', share: 0.12, align: 'left' },
  { label: 'In', share: 0.05, align: 'right' },
  { label: 'Out', share: 0.05, align: 'right' },
  { label: 'Balance', share: 0.06, align: 'right' },
  { label: 'By', share: 0.08, align: 'left' },
]);

/**
 * The controlled-drug register of one medicine for a period, for the inspector.
 *
 * @param {import('zod').infer<typeof import('@ihealth/shared/schemas').controlledRegisterSchema>} register
 * @param {{ pharmacyName: string, printedBy: string, printedAt: string, formatDate: (date: string) => string }} context
 * @returns {Promise<Buffer>}
 */
export function renderRegister(register, { pharmacyName, printedBy, printedAt, formatDate }) {
  const doc = new PDFDocument({ ...PAGE, bufferPages: true });
  const left = PAGE.margin;
  const width = doc.page.width - PAGE.margin * 2;
  /** @type {Buffer[]} */
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  /**
   * @param {string[]} cells
   * @param {boolean} [bold]
   * @returns {void}
   */
  const row = (cells, bold = false) => {
    doc.font(bold ? FONT_BOLD : FONT).fontSize(SIZE.body);
    const heights = cells.map((cell, index) =>
      doc.heightOfString(cell, { width: COLUMNS[index].share * width - COLUMN_GAP }),
    );
    const height = Math.max(...heights) + ROW_GAP;
    if (doc.y + height > doc.page.height - PAGE.margin) {
      doc.addPage();
      header();
    }
    const top = doc.y;
    let x = left;
    cells.forEach((cell, index) => {
      const columnWidth = COLUMNS[index].share * width;
      doc.text(cell, x, top, { width: columnWidth - COLUMN_GAP, align: COLUMNS[index].align });
      x += columnWidth;
    });
    doc.y = top + height;
    doc
      .moveTo(left, doc.y - ROW_GAP / 2)
      .lineTo(left + width, doc.y - ROW_GAP / 2)
      .lineWidth(RULE_WIDTH)
      .stroke();
  };
  const header = () =>
    row(
      COLUMNS.map((column) => column.label),
      true,
    );

  doc.font(FONT_BOLD).fontSize(SIZE.title).text('Controlled-drug register', left, doc.y);
  doc
    .font(FONT)
    .fontSize(SIZE.heading)
    .text(pharmacyName)
    .text(
      `${register.item.name}${register.item.code ? ` (${register.item.code})` : ''} · ${formatDate(register.from)} to ${formatDate(register.to)}`,
    )
    .text(`Opening balance ${register.opening} · Closing balance ${register.closing}`)
    .moveDown(0.6);
  header();
  for (const entry of register.entries) {
    row([
      `${formatDate(entry.at.slice(0, 10))} ${entry.at.slice(11, 16)}`,
      entry.entryType ?? KIND_LABELS[entry.kind],
      entry.billCode ?? entry.invoiceNo ?? '',
      entry.batchNo ?? '',
      entry.patientName ?? '',
      entry.patientIdNumber ?? '',
      entry.doctorName ?? '',
      entry.quantityIn ? String(entry.quantityIn) : '',
      entry.quantityOut ? String(entry.quantityOut) : '',
      String(entry.balance),
      entry.by ?? '',
    ]);
  }
  if (!register.entries.length)
    doc.font(FONT).fontSize(SIZE.body).text('No movements in this period.');

  // Every page says when it was printed and by whom, and which page it is.
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(index);
    // Written in the bottom margin, where pdfkit would otherwise start a new page.
    doc.page.margins.bottom = 0;
    doc
      .font(FONT)
      .fontSize(SIZE.body)
      .text(
        `Printed ${printedAt} by ${printedBy} · Page ${index + 1} of ${range.count}`,
        left,
        doc.page.height - PAGE.margin + ROW_GAP,
        { width, align: 'right', lineBreak: false },
      );
  }
  doc.end();
  return /** @type {Promise<Buffer>} */ (done);
}
