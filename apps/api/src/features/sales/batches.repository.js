/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over the legacy stock table */
import { Prisma } from '#db';

/**
 * Reads the batches of a sale with what pricing and saving need. Raw SQL: some legacy expiry dates
 * are zero dates, which fail a read through the models. With `lock`, the rows stay locked until the
 * transaction ends, so two tills cannot sell the same units.
 *
 * @param {any} client The Prisma client, or a transaction when locking.
 * @param {number[]} stockIds
 * @param {number} pharmacyId
 * @param {{ lock?: boolean }} [options]
 * @returns {Promise<Map<number, Record<string, any>>>}
 */
export async function loadBatches(client, stockIds, pharmacyId, { lock = false } = {}) {
  /** @type {Record<string, any>[]} */
  const rows = await client.$queryRaw`
    SELECT st.STOCK_ID AS stockId, st.ITEM_ID AS itemId, it.ITEM_NM AS itemName, it.ITEM_CD AS itemCode,
      st.BATCH_NO AS batchNo, st.BARCODE AS barcode, CAST(st.EXPIRY_DT AS CHAR) AS expiryDate,
      st.QUANTITY AS available, st.UNIT_SALE_RATE AS labelPrice,
      COALESCE(tc.CATEGORY_VALUE, st.VAT, 0) AS vatPercent, st.TAX_CATEGORY_ID AS taxCategoryId,
      tc.CATEGORY_CODE AS taxCode, st.UNIT_PURCHASE_RATE AS unitCost,
      st.PURCHASE_DISCOUNT_PERCENTAGE AS costDiscountPercent, sc.SCHEDULE_CATEGORY_CODE AS scheduleCode
    FROM stock st
      LEFT JOIN items it ON it.ITEM_ID = st.ITEM_ID
      LEFT JOIN taxcategory tc ON tc.TAXCATEGORY_ID = st.TAX_CATEGORY_ID
      LEFT JOIN schedule_category_code sc ON sc.SCHEDULE_CATEGORY_CODE_ID = it.SCHEDULE_CATEGORY_CODE_ID
    WHERE st.STOCK_ID IN (${Prisma.join(stockIds)}) AND st.PHARMACY_ID = ${pharmacyId}
    ${lock ? Prisma.sql`FOR UPDATE OF st` : Prisma.empty}`;
  return new Map(rows.map((row) => [Number(row.stockId), row]));
}

/**
 * @param {unknown} value A legacy DATE read as text.
 * @returns {string | null} The date, or null for an empty or zero date.
 */
export function batchExpiry(value) {
  const text = String(value ?? '').trim();
  return text && !text.startsWith('0000') ? text : null;
}

const ISO_DATE_LOCALE = 'en-CA'; // hardcode-ok: a locale that formats dates as YYYY-MM-DD, used only to build text

/**
 * @param {string} timeZone
 * @returns {string} Today's date in that time zone, `YYYY-MM-DD`.
 */
export const todayIn = (timeZone) =>
  new Intl.DateTimeFormat(ISO_DATE_LOCALE, { timeZone }).format(new Date());
