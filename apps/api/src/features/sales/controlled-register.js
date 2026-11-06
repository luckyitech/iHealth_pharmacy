/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy and additive tables */
import { MEDICINE_KINDS, REGISTER_ENTRY_KINDS } from '@ihealth/shared/schemas';

import { Prisma } from '#db';

/**
 * Names the legacy triggers and screens give each stock change (stock.ENTRY_TYPE), by what the
 * register calls it. Anything else that changed the quantity is "other".
 */
const ENTRY_TYPES = Object.freeze({
  [REGISTER_ENTRY_KINDS.SOLD]: ['Sales Billing'],
  [REGISTER_ENTRY_KINDS.CANCELLED]: ['Sales Canceling'],
  [REGISTER_ENTRY_KINDS.RECEIVED]: [
    'Invoice Addition',
    'Purchase',
    'Purchase Update',
    'New Stock Addition',
  ],
  [REGISTER_ENTRY_KINDS.RETURNED_TO_SUPPLIER]: [
    'Purchase Return',
    'Exp. Return',
    'Purchase Delete',
  ],
  [REGISTER_ENTRY_KINDS.STOCK_COUNT]: ['Stock Take', 'Stock Update'],
});
/** Legacy stock counts were also written as "Stock Update - <date>". */
const STOCK_UPDATE_PREFIX = 'Stock Update';
/** Shown for a batch's first stock, which the legacy app records without a name. */
const NEW_BATCH = 'New batch';
/** The time a day ends, for periods given as dates. */
const END_OF_DAY = '23:59:59';

/**
 * @param {string | null} entryType
 * @returns {string} The register's kind of change.
 */
function kindOf(entryType) {
  const type = String(entryType ?? '').trim();
  for (const [kind, types] of Object.entries(ENTRY_TYPES)) if (types.includes(type)) return kind;
  if (type.startsWith(STOCK_UPDATE_PREFIX)) return REGISTER_ENTRY_KINDS.STOCK_COUNT;
  return REGISTER_ENTRY_KINDS.OTHER;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const textOrNull = (value) => String(value ?? '').trim() || null;

/**
 * @param {(string | null | undefined)[]} parts
 * @returns {string | null}
 */
const nameOf = (parts) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ') || null;

/**
 * The controlled-drug register: every unit of a controlled drug that came in or went out, with a
 * running balance. The quantities come from the legacy stock_history table, which the legacy
 * triggers fill on every change to a batch (sales, cancellations, goods received, returns, stock
 * counts), so sales made in the legacy app are in it too. Who the drug went to, and on whose
 * prescription, comes from the bill and, for the new till, from its register entry.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The service.
 */
export function createControlledRegister({ prisma, config }) {
  /** The legacy schedule code of controlled drugs. */
  const controlledCode = /** @type {{ code: string }} */ (
    config.medicine.types.find((type) => type.kind === MEDICINE_KINDS.CONTROLLED)
  ).code.toUpperCase();

  return {
    /**
     * @param {number} pharmacyId
     * @returns {Promise<{ id: number, name: string, code: string | null, onHand: number }[]>}
     */
    async items(pharmacyId) {
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT it.ITEM_ID AS id, it.ITEM_NM AS name, it.ITEM_CD AS code,
          COALESCE((SELECT SUM(st.QUANTITY) FROM stock st
            WHERE st.ITEM_ID = it.ITEM_ID AND st.PHARMACY_ID = ${pharmacyId}), 0) AS onHand
        FROM items it
          JOIN schedule_category_code sc ON sc.SCHEDULE_CATEGORY_CODE_ID = it.SCHEDULE_CATEGORY_CODE_ID
        WHERE UPPER(TRIM(sc.SCHEDULE_CATEGORY_CODE)) = ${controlledCode}
        ORDER BY it.ITEM_NM`;
      return rows.map((row) => ({
        id: Number(row.id),
        name: textOrNull(row.name) ?? `Item ${row.id}`,
        code: textOrNull(row.code),
        onHand: Number(row.onHand ?? 0),
      }));
    },

    /**
     * @param {{ itemId: number, from: string, to: string }} query Dates are `YYYY-MM-DD`, both included.
     * @param {number} pharmacyId
     * @returns {Promise<import('zod').infer<typeof import('@ihealth/shared/schemas').controlledRegisterSchema> | null>} Null when the item is not a controlled drug.
     */
    async read({ itemId, from, to }, pharmacyId) {
      const item = (await this.items(pharmacyId)).find((row) => row.id === itemId);
      if (!item) return null;

      /** @type {Record<string, any>[]} */
      const history = await prisma.$queryRaw`
        SELECT h.STOCK_ID AS stockId, h.BATCH_NO AS batchNo, h.QUANTITY AS quantity,
          LAG(h.QUANTITY) OVER (PARTITION BY h.STOCK_ID ORDER BY h.LAST_UPDATE_TS, h.STOCK_HISTORY_ID) AS previous,
          CAST(h.LAST_UPDATE_TS AS CHAR) AS at, h.ENTRY_TYPE AS entryType, h.BILL_ID AS billId,
          h.INVOICE_NO AS invoiceNo, h.LAST_UPDATE_USER_ID AS byId
        FROM stock_history h
        WHERE h.ITEM_ID = ${itemId} AND h.PHARMACY_ID = ${pharmacyId}
          AND h.LAST_UPDATE_TS <= ${`${to} ${END_OF_DAY}`}
        ORDER BY h.LAST_UPDATE_TS, h.STOCK_HISTORY_ID`;

      /** @type {Map<number, number>} What each batch held when the period started. */
      const before = new Map();
      /** @type {Record<string, any>[]} */
      const moves = [];
      for (const row of history) {
        const quantity = Number(row.quantity ?? 0);
        const delta = quantity - Number(row.previous ?? 0);
        if (String(row.at) < from) before.set(Number(row.stockId), quantity);
        else if (delta !== 0) moves.push({ ...row, delta });
      }
      const opening = [...before.values()].reduce((sum, quantity) => sum + quantity, 0);

      const billIds = [
        ...new Set(
          moves
            .map((move) => move.billId)
            .filter(Boolean)
            .map(Number),
        ),
      ];
      /** @type {Record<string, any>[]} */
      const bills = billIds.length
        ? await prisma.$queryRaw`
            SELECT s.BILL_ID AS billId, s.BILL_CODE AS code, s.CUSTOMER_NM AS customerName,
              s.EMPLOYEE_ID AS cashierId, s.PROVIDER_ID AS doctorId,
              p.FIRST_NM AS doctorFirst, p.LAST_NM AS doctorLast,
              d.PATIENT_NAME AS patientName, d.PATIENT_ID_NUMBER AS idNumber
            FROM sales s
              LEFT JOIN provider p ON p.PROVIDER_ID = s.PROVIDER_ID
              LEFT JOIN ih_controlled_dispense d ON d.BILL_ID = s.BILL_ID AND d.ITEM_ID = ${itemId}
            WHERE s.BILL_ID IN (${Prisma.join(billIds)})`
        : [];
      const billOf = new Map(bills.map((bill) => [Number(bill.billId), bill]));

      const staffIds = [
        ...new Set(
          [
            ...moves.map((move) => Number(move.byId)),
            ...bills.map((bill) => Number(bill.cashierId)),
          ].filter((id) => Number.isInteger(id) && id > 0),
        ),
      ];
      const staff = staffIds.length
        ? await prisma.employee.findMany({
            where: { employeeId: { in: staffIds } },
            select: { employeeId: true, firstNm: true, lastNm: true },
          })
        : [];
      const staffName = new Map(
        staff.map((row) => [row.employeeId, nameOf([row.firstNm, row.lastNm])]),
      );

      let balance = opening;
      const entries = moves.map((move) => {
        balance += move.delta;
        const kind = kindOf(move.entryType);
        const onBill =
          kind === REGISTER_ENTRY_KINDS.SOLD || kind === REGISTER_ENTRY_KINDS.CANCELLED;
        const bill = onBill ? billOf.get(Number(move.billId)) : undefined;
        const placeholder = Number(bill?.doctorId) === config.sales.defaultProviderId;
        return {
          at: String(move.at),
          kind: /** @type {any} */ (kind),
          entryType:
            kind === REGISTER_ENTRY_KINDS.OTHER
              ? (textOrNull(move.entryType) ?? (move.previous === null ? NEW_BATCH : null))
              : null,
          batchNo: textOrNull(move.batchNo),
          billId: bill ? Number(bill.billId) : null,
          billCode: textOrNull(bill?.code),
          invoiceNo: kind === REGISTER_ENTRY_KINDS.RECEIVED ? textOrNull(move.invoiceNo) : null,
          patientName: textOrNull(bill?.patientName) ?? textOrNull(bill?.customerName),
          patientIdNumber: textOrNull(bill?.idNumber),
          doctorName: placeholder ? null : nameOf([bill?.doctorFirst, bill?.doctorLast]),
          quantityIn: Math.max(move.delta, 0),
          quantityOut: Math.max(-move.delta, 0),
          balance,
          // The legacy sale trigger does not record who sold; the bill does.
          by:
            (bill ? staffName.get(Number(bill.cashierId)) : staffName.get(Number(move.byId))) ??
            null,
        };
      });
      return { item, from, to, opening, closing: balance, entries };
    },
  };
}
