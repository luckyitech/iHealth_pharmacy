import PDFDocument from 'pdfkit';

/** Thermal receipt paper, as the legacy receipt: 80 mm wide, in points. */
const POINTS_PER_MM = 72 / 25.4;
const PAPER_WIDTH = 80 * POINTS_PER_MM;
const MARGIN = 10;
/** The legacy receipt printed everything in bold Helvetica: 9 pt for the name, 7 pt for the rest. */
const FONT_BOLD = 'Helvetica-Bold';
const SIZE = Object.freeze({ name: 9, body: 7 });
const ROW_GAP = 3;
/** Height reserved per part, so the page can be sized before drawing (thermal paper is one long page). */
const HEIGHT = Object.freeze({ header: 130, line: 20, totals: 150, footerLine: 10 });
/**
 * Item table columns, with the legacy receipt's names and widths (1, 3, 1, 1, 1, 1).
 *
 * @typedef {'left' | 'center' | 'right'} Align
 * @type {ReadonlyArray<{ key: string, label: string, share: number, align: Align }>}
 */
const COLUMNS = Object.freeze([
  { key: 'sn', label: 'SN', share: 1 / 8, align: 'left' },
  { key: 'item', label: 'Item Name', share: 3 / 8, align: 'left' },
  { key: 'qty', label: 'QTY', share: 1 / 8, align: 'right' },
  { key: 'tax', label: 'TAX', share: 1 / 8, align: 'center' },
  { key: 'price', label: 'Price', share: 1 / 8, align: 'right' },
  { key: 'total', label: 'Total', share: 1 / 8, align: 'right' },
]);
/** Shown where the legacy receipt printed "N/A": no prescriber or no customer. */
const NONE = 'N/A';

const METHOD_LABELS = Object.freeze({
  cash: 'Cash',
  mpesa: 'M-Pesa',
  card: 'Card',
  cheque: 'Cheque',
  credit: 'Credit',
  creditNote: 'Credit note',
});

/** Payment status as the legacy receipt printed it. */
const STATUS_LABELS = Object.freeze({
  paid: 'Paid',
  partlyPaid: 'Partially Paid',
  pending: 'Pending',
  overPaid: 'Over Paid',
  cancelled: 'Cancel',
  notCounted: 'Not Counted',
  other: '',
});

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').billDetailSchema>} BillDetail
 * @typedef {{ name: string, addressLines: string[], phone: string | null, email: string | null, taxPin: string | null }} ReceiptPharmacy
 * @typedef {{ locale: string, currency: string }} Region
 * @typedef {{ code: string, percent: number }} TaxCode
 */

/**
 * @typedef {object} ReceiptContext
 * @property {ReceiptPharmacy} pharmacy
 * @property {Region} region
 * @property {string} printedBy
 * @property {string} printedAt `YYYY-MM-DD HH:MM`, local time.
 * @property {boolean} [copy] The receipt is marked "COPY" unless false (the first print of a new sale).
 * @property {TaxCode[]} [taxCodes] Tax codes in force on the bill's date, for the "Tax Codes" lines.
 * @property {string[]} [exemptCodes] Codes printed as "Exempt" instead of a rate.
 * @property {string | null} [returnNote] The line printed in quotes under the totals.
 * @property {string[]} [footerLines] The receipt's closing lines (the legacy receipt setting).
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
 * "SALES RECEIPT", the bill number, prescriber, date and customer, the items (SN, Item Name, QTY,
 * TAX, Price, Total), the totals in two columns, who served and who printed, the tax codes with the
 * amount sold under each, remarks, the return note and the closing lines. A reprint says "COPY".
 * Costs and profit are never printed.
 *
 * @param {BillDetail} bill
 * @param {ReceiptContext} context
 * @returns {Promise<Buffer>}
 */
export function renderReceipt(bill, context) {
  const {
    pharmacy,
    region,
    printedBy,
    printedAt,
    copy = true,
    taxCodes = [],
    exemptCodes = [],
    returnNote = null,
    footerLines = [],
  } = context;
  const height =
    HEIGHT.header +
    bill.lines.length * HEIGHT.line +
    bill.payments.length * HEIGHT.footerLine +
    HEIGHT.totals +
    footerLines.length * HEIGHT.footerLine;
  const doc = new PDFDocument({ size: [PAPER_WIDTH, height], margin: MARGIN });
  const width = PAPER_WIDTH - MARGIN * 2;
  const number = new Intl.NumberFormat(region.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  /**
   * @param {string | number} value
   * @returns {string} Money as the legacy receipt printed it: digits only, two decimals.
   */
  const amount = (value) => number.format(Number(value));

  /** @type {Buffer[]} */
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font(FONT_BOLD).fontSize(SIZE.body);

  /**
   * @param {string} text
   * @param {{ size?: number, align?: 'left' | 'center' | 'right' }} [options]
   * @returns {void}
   */
  const line = (text, { size = SIZE.body, align = 'left' } = {}) => {
    doc.fontSize(size).text(text, MARGIN, doc.y, { width, align });
    doc.fontSize(SIZE.body);
  };

  const rule = () => {
    const y = doc.y + 1;
    doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + width, y)
      .lineWidth(0.5)
      .stroke();
    doc.y = y + 3;
  };

  /**
   * One row of cells across the page; each cell is [text, share of the width, alignment].
   *
   * @param {[string, number, Align?][]} cells
   * @returns {void}
   */
  const row = (cells) => {
    const y = doc.y;
    let x = MARGIN;
    let bottom = y;
    for (const [text, share, align = 'left'] of cells) {
      doc.text(text, x, y, { width: width * share - 2, align });
      bottom = Math.max(bottom, doc.y);
      x += width * share;
    }
    doc.y = bottom + ROW_GAP - 2;
  };

  /**
   * Two label/value pairs side by side, as the legacy totals: `Tot. Items : 2   Tot. Amt : 687.50`.
   *
   * @param {[string, string]} left
   * @param {[string, string]} [right]
   * @returns {void}
   */
  const pairs = (left, right) =>
    row([
      [left[0], 0.24],
      [left[1], 0.26],
      [right?.[0] ?? '', 0.24],
      [right?.[1] ?? '', 0.26, 'right'],
    ]);

  // Header: the pharmacy, as on its profile, then the title.
  line(pharmacy.name, { size: SIZE.name, align: 'center' });
  if (pharmacy.addressLines.length) line(pharmacy.addressLines.join(', '), { align: 'center' });
  if (pharmacy.taxPin) line(`PIN: ${pharmacy.taxPin}`, { align: 'center' });
  const contact = [pharmacy.phone && `Tel: ${pharmacy.phone}`, pharmacy.email]
    .filter(Boolean)
    .join('  ');
  if (contact) line(contact, { align: 'center' });
  doc.moveDown(0.6);
  line(copy ? 'SALES RECEIPT (COPY)' : 'SALES RECEIPT', { align: 'center' });
  doc.moveDown(0.4);

  // Bill details.
  rule();
  row([
    ['Bill # :', 0.16],
    [bill.code ?? String(bill.id), 0.38],
    ['Dr.Name :', 0.2],
    [bill.prescriberName ?? NONE, 0.26],
  ]);
  row([
    ['Dt. :', 0.16],
    [localDateTime(bill.createdAt ?? bill.billDate, region.locale), 0.84],
  ]);
  row([
    ['Cust :', 0.16],
    [bill.customerName ?? NONE, 0.84],
  ]);
  rule();

  // Items. The legacy "Price" is what one unit came to: the line total over its quantity.
  row(
    COLUMNS.map(
      (column) =>
        /** @type {[string, number, Align]} */ ([column.label, column.share, column.align]),
    ),
  );
  rule();
  bill.lines.forEach((item, index) => {
    row(
      COLUMNS.map((column) => {
        const cells = {
          sn: String(index + 1),
          item: item.itemName ?? '',
          qty: String(item.quantity),
          tax: item.taxCode ?? '',
          price: item.quantity ? amount(Number(item.amount) / item.quantity) : amount(0),
          total: amount(item.amount),
        };
        return /** @type {[string, number, Align]} */ ([
          cells[/** @type {keyof typeof cells} */ (column.key)],
          column.share,
          column.align,
        ]);
      }),
    );
  });
  rule();

  // Totals, two pairs per row as the legacy receipt.
  const quantity = bill.lines.reduce((total, item) => total + item.quantity, 0);
  pairs(['Tot. Items :', String(bill.lines.length)], ['Tot. Amt :', amount(bill.totals.gross)]);
  pairs(['Tot. Qty. :', String(quantity)], ['Tot. Dis. :', amount(bill.totals.discount)]);
  pairs(['Vat Amt :', amount(bill.totals.vat)], ['Net Amt :', amount(bill.totals.net)]);
  pairs(['Bal Amt :', amount(bill.totals.balance)], ['Paid Amt :', amount(bill.totals.paid)]);
  // How it was paid: the legacy receipt did not say; the method and its reference help when checking.
  for (const payment of bill.payments) {
    const label = METHOD_LABELS[/** @type {keyof typeof METHOD_LABELS} */ (payment.method)];
    pairs([`${label} :`, payment.reference ?? ''], ['', amount(payment.amount)]);
  }
  rule();
  pairs(
    ['Serv By :', bill.cashierName ?? ''],
    ['Paid Status:', STATUS_LABELS[/** @type {keyof typeof STATUS_LABELS} */ (bill.status)]],
  );
  row([
    ['Print By :', 0.24],
    [`${printedBy}   ${localDateTime(printedAt, region.locale)}`, 0.76],
  ]);
  rule();

  // Tax codes in force, then what was sold under each.
  if (taxCodes.length) {
    const share = 1 / (taxCodes.length + 1);
    row([
      ['Tax Codes:', share],
      ...taxCodes.map(
        ({ code, percent }) =>
          /** @type {[string, number]} */ ([
            exemptCodes.includes(code) ? `${code} - Exempt` : `${code} - ${percent}%:`,
            share,
          ]),
      ),
    ]);
    row([
      ['', share],
      ...taxCodes.map(({ code }) => {
        const sold = bill.lines
          .filter((item) => item.taxCode === code)
          .reduce((total, item) => total + Number(item.amount), 0);
        return /** @type {[string, number]} */ ([`${code} = ${amount(sold)}`, share]);
      }),
    ]);
    rule();
  }
  line(`Remarks : ${bill.remarks ?? '-'}`);
  rule();
  if (returnNote) {
    doc.moveDown(0.3);
    line(`"${returnNote}"`, { align: 'center' });
  }
  if (footerLines.length) {
    doc.moveDown(0.5);
    for (const text of footerLines) line(text, { align: 'center' });
  }

  doc.end();
  return /** @type {Promise<Buffer>} */ (done);
}
