import { MEDICINE_KINDS } from '@ihealth/shared/schemas';
import PDFDocument from 'pdfkit';

/** The legacy dosing sticker: 40 mm wide and 68 pt (about 24 mm) tall, one sticker a page. */
const POINTS_PER_MM = 72 / 25.4;
const WIDTH = 40 * POINTS_PER_MM;
const HEIGHT = 68;
const MARGIN = 4;
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const SIZE = Object.freeze({ header: 4, item: 6, dose: 5.5, footer: 3.5 });
/** The mark a prescription-only, controlled or antibiotic medicine carries after its name. */
const MARKS = Object.freeze({
  [MEDICINE_KINDS.PRESCRIPTION]: 'Rx',
  [MEDICINE_KINDS.CONTROLLED]: 'CD',
  [MEDICINE_KINDS.ANTIBIOTIC]: 'AB',
});
/** The legacy sticker shows the first two words of the patient's name. */
const PATIENT_WORDS = 2;

/**
 * @typedef {object} Sticker
 * @property {string} itemName
 * @property {string} text The dose.
 * @property {number} copies
 * @property {string | null} expiry e.g. "08/2027"
 * @property {string | null} medicineKind
 */

/**
 * Dosing stickers in the legacy layout: the pharmacy at the top left and the expiry at the top
 * right; the medicine (with its Rx, CD or AB mark) and the dose; the patient and the date
 * dispensed at the bottom left, and the warning at the bottom right.
 *
 * @param {Sticker[]} stickers
 * @param {{ header: string[], footer: string[], patientName: string | null, dispensedOn: string }} context
 * @returns {Promise<Buffer>}
 */
export function renderLabels(stickers, { header, footer, patientName, dispensedOn }) {
  const doc = new PDFDocument({ size: [WIDTH, HEIGHT], margin: MARGIN, autoFirstPage: false });
  const inner = WIDTH - MARGIN * 2;
  /** @type {Buffer[]} */
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const patient = (patientName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, PATIENT_WORDS)
    .join(' ');
  const bottomLeft = [patient, dispensedOn].filter(Boolean).join(' · ');

  for (const sticker of stickers) {
    for (let copy = 0; copy < sticker.copies; copy += 1) {
      doc.addPage();
      // Nothing may start a new page: each sticker is one page.
      doc.page.margins.bottom = 0;
      const half = inner / 2;
      doc.font(FONT).fontSize(SIZE.header);
      doc.text(header.join(' · '), MARGIN, MARGIN, { width: inner * 0.7, height: SIZE.header * 3 });
      if (sticker.expiry)
        doc.text(`Exp ${sticker.expiry}`, MARGIN + inner * 0.7, MARGIN, {
          width: inner * 0.3,
          align: 'right',
        });
      const mark = sticker.medicineKind
        ? MARKS[/** @type {keyof typeof MARKS} */ (sticker.medicineKind)]
        : null;
      doc
        .font(FONT_BOLD)
        .fontSize(SIZE.item)
        .text(
          `${sticker.itemName}${mark ? ` · ${mark}` : ''}`,
          MARGIN,
          MARGIN + SIZE.header * 3.2,
          {
            width: inner,
            lineBreak: false,
            ellipsis: true,
          },
        );
      doc
        .font(FONT)
        .fontSize(SIZE.dose)
        .text(sticker.text, MARGIN, doc.y + 1, {
          width: inner,
          height: SIZE.dose * 3.6,
          ellipsis: true,
        });
      const bottom = HEIGHT - MARGIN - SIZE.footer * 2.4;
      doc.fontSize(SIZE.footer);
      doc.text(bottomLeft, MARGIN, bottom, { width: half, height: SIZE.footer * 2.4 });
      doc.text(footer.join(' '), MARGIN + half, bottom, {
        width: half,
        align: 'right',
        height: SIZE.footer * 2.4,
      });
    }
  }
  doc.end();
  return /** @type {Promise<Buffer>} */ (done);
}
