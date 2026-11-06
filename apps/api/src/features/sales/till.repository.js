/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy tables */
import { moneyToString, roundMoney } from '@ihealth/shared/money';

import { Prisma } from '#db';

import { escapeLike } from '../../lib/sql-like.js';
import { batchExpiry } from './batches.repository.js';
import { medicineKindOf } from './medicine-types.js';

/** Legacy flag of an active customer. */
const ACTIVE = 'Y';
/** A search of only digits (and spaces or dashes) is also looked for in phone numbers. */
const PHONE_DIGITS = /^\d+$/;

const SELLABLE_COLUMNS = Prisma.sql`
  st.STOCK_ID AS stockId, st.ITEM_ID AS itemId, it.ITEM_NM AS itemName, it.ITEM_CD AS itemCode,
  gn.GENERIC_NAME AS genericName, st.BATCH_NO AS batchNo, st.BARCODE AS barcode,
  CAST(st.EXPIRY_DT AS CHAR) AS expiryDate, st.QUANTITY AS available, st.UNIT_SALE_RATE AS labelPrice,
  COALESCE(tc.CATEGORY_VALUE, st.VAT, 0) AS vatPercent, sc.SCHEDULE_CATEGORY_CODE AS scheduleCode`;

const SELLABLE_FROM = Prisma.sql`
  FROM stock st
    JOIN items it ON it.ITEM_ID = st.ITEM_ID
    LEFT JOIN items_generic_names gn ON gn.ITEM_GENERIC_NAME_ID = it.ITEM_GENERIC_NAME_ID
    LEFT JOIN taxcategory tc ON tc.TAXCATEGORY_ID = st.TAX_CATEGORY_ID
    LEFT JOIN schedule_category_code sc ON sc.SCHEDULE_CATEGORY_CODE_ID = it.SCHEDULE_CATEGORY_CODE_ID`;

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const textOrNull = (value) => String(value ?? '').trim() || null;

/**
 * @param {Record<string, any>} row
 * @param {{ today: string, medicineTypes: readonly import('./medicine-types.js').MedicineType[] }} context `today` is `YYYY-MM-DD`.
 * @returns {import('zod').infer<typeof import('@ihealth/shared/schemas').sellableBatchSchema>}
 */
function toSellableBatch(row, { today, medicineTypes }) {
  const expiryDate = batchExpiry(row.expiryDate);
  return {
    stockId: Number(row.stockId),
    itemId: row.itemId === null ? null : Number(row.itemId),
    itemName: textOrNull(row.itemName),
    itemCode: textOrNull(row.itemCode),
    genericName: textOrNull(row.genericName),
    batchNo: textOrNull(row.batchNo),
    barcode: textOrNull(row.barcode),
    expiryDate,
    expired: Boolean(expiryDate && expiryDate < today),
    available: Number(row.available ?? 0),
    labelPrice: moneyToString(roundMoney(Number(row.labelPrice ?? 0))),
    vatPercent: Number(row.vatPercent ?? 0),
    medicineKind: medicineKindOf(medicineTypes, row.scheduleCode),
  };
}

/**
 * Batches of each item in the order the till should offer them: the first to expire first, and
 * expired ones last (they are shown, so the cashier knows why they cannot be sold).
 *
 * @param {ReturnType<typeof toSellableBatch>[]} batches Already ordered by item, then expiry.
 * @returns {ReturnType<typeof toSellableBatch>[]}
 */
function firstToExpireFirst(batches) {
  /** @type {Map<number | null, ReturnType<typeof toSellableBatch>[]>} */
  const byItem = new Map();
  for (const batch of batches)
    byItem.set(batch.itemId, [...(byItem.get(batch.itemId) ?? []), batch]);
  return [...byItem.values()].flatMap((group) => [
    ...group.filter((batch) => !batch.expired),
    ...group.filter((batch) => batch.expired),
  ]);
}

/**
 * Reads for the till: batches to sell from and customers to put on a bill.
 *
 * @param {import('#db').PrismaClient} prisma
 * @returns The repository.
 */
export function createTillRepository(prisma) {
  return {
    /**
     * Batches in stock that match a scan or a search, as the legacy till found them: by barcode,
     * item code, item or generic name, or batch number. A barcode that matches exactly lists every
     * batch of that item, so the first to expire can be taken.
     *
     * @param {string} q
     * @param {{ pharmacyId: number, today: string, limit: number, medicineTypes: readonly import('./medicine-types.js').MedicineType[] }} options
     * @returns {Promise<{ batches: ReturnType<typeof toSellableBatch>[], scanned: boolean }>}
     */
    async searchBatches(q, { pharmacyId, today, limit, medicineTypes }) {
      const context = { today, medicineTypes };
      const inStock = Prisma.sql`st.PHARMACY_ID = ${pharmacyId} AND st.QUANTITY > 0`;
      const order = Prisma.sql`ORDER BY it.ITEM_NM, st.ITEM_ID, st.EXPIRY_DT, st.STOCK_ID LIMIT ${limit}`;

      /** @type {Record<string, any>[]} */
      const scannedRows = await prisma.$queryRaw`
        SELECT ${SELLABLE_COLUMNS} ${SELLABLE_FROM}
        WHERE ${inStock} AND st.ITEM_ID IN (
          SELECT bc.ITEM_ID FROM stock bc WHERE bc.BARCODE = ${q} AND bc.PHARMACY_ID = ${pharmacyId})
        ${order}`;
      if (scannedRows.length) {
        return {
          batches: firstToExpireFirst(scannedRows.map((row) => toSellableBatch(row, context))),
          scanned: true,
        };
      }

      const starts = `${escapeLike(q)}%`;
      const wordStarts = `% ${escapeLike(q)}%`;
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT ${SELLABLE_COLUMNS} ${SELLABLE_FROM}
        WHERE ${inStock} AND (
          it.ITEM_NM LIKE ${starts} OR it.ITEM_NM LIKE ${wordStarts} OR it.ITEM_CD LIKE ${starts}
          OR gn.GENERIC_NAME LIKE ${starts} OR st.BATCH_NO LIKE ${starts})
        ${order}`;
      return {
        batches: firstToExpireFirst(rows.map((row) => toSellableBatch(row, context))),
        scanned: false,
      };
    },

    /**
     * @returns {Promise<{ id: number, name: string }[]>} Active banks, by name.
     */
    async activeBanks() {
      const rows = await prisma.ihBank.findMany({
        where: { activeS: ACTIVE },
        select: { bankId: true, bankName: true },
        orderBy: { bankName: 'asc' },
      });
      return rows.map((row) => ({ id: row.bankId, name: row.bankName.trim() }));
    },

    /**
     * Active customers whose name or phone matches, for the customer type-ahead: every word typed
     * starts the first or last name ("jan tes" finds Jane Testcase), or the digits are in the phone.
     * Names that start with what was typed come first.
     *
     * @param {string} q
     * @param {number} limit Most customers to list.
     * @returns {Promise<{ id: number, name: string, phone: string | null }[]>}
     */
    async searchCustomers(q, limit) {
      const words = q.split(/\s+/).filter(Boolean);
      // Phone numbers are stored without spaces or dashes.
      const digits = q.replace(/[\s-]/g, '');
      const byName = words.map((word) => ({
        OR: [{ firstNm: { startsWith: word } }, { lastNm: { startsWith: word } }],
      }));
      const rows = await prisma.customer.findMany({
        where: {
          activeS: ACTIVE,
          OR: [
            { AND: byName },
            ...(PHONE_DIGITS.test(digits) ? [{ phoneNbr: { contains: digits } }] : []),
          ],
        },
        select: { customerId: true, firstNm: true, lastNm: true, phoneNbr: true },
        orderBy: [{ firstNm: 'asc' }, { lastNm: 'asc' }],
        take: limit,
      });
      return rows.map((row) => ({
        id: row.customerId,
        name: [row.firstNm, row.lastNm]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(' '),
        phone: textOrNull(row.phoneNbr),
      }));
    },
  };
}
