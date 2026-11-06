/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy tables */
import { BILL_FLAGS, BILL_STATUSES, PAYMENT_METHODS } from '@ihealth/shared/schemas';
import {
  addMoney,
  compareMoney,
  moneyToString,
  roundMoney,
  subtractMoney,
  toMoney,
} from '@ihealth/shared/money';

import { Prisma } from '#db';

import { escapeLike } from '../../lib/sql-like.js';

/** Legacy `PAYMENT_STATUS` text (compared without case) -> status. */
const LEGACY_STATUS = Object.freeze({
  paid: BILL_STATUSES.PAID,
  'partially paid': BILL_STATUSES.PARTLY_PAID,
  pending: BILL_STATUSES.PENDING,
  'over paid': BILL_STATUSES.OVER_PAID,
  cancel: BILL_STATUSES.CANCELLED,
  'dummy bill': BILL_STATUSES.NOT_COUNTED,
});

/** Payment method -> legacy amount column and the column holding its reference. */
const PAYMENT_COLUMNS = Object.freeze({
  [PAYMENT_METHODS.CASH]: { amount: 'CASH_AMOUNT', reference: null },
  [PAYMENT_METHODS.MPESA]: { amount: 'UPI_AMOUNT', reference: 'UPI_TRANS_ID' },
  [PAYMENT_METHODS.CARD]: { amount: 'CREDIT_CARD_AMOUNT', reference: 'CREDIT_CARD_NO' },
  [PAYMENT_METHODS.CHEQUE]: { amount: 'CHEQUE_AMT', reference: 'CHEQUE_NUMBER' },
  [PAYMENT_METHODS.CREDIT]: { amount: 'CREDIT_AMOUNT', reference: 'CREDIT_ACCOUNT_NO' },
  [PAYMENT_METHODS.CREDIT_NOTE]: { amount: 'CREDIT_NOTE_AMOUNT', reference: 'SALES_CREDIT_REF_NO' },
});

/** Methods that settle a bill at the counter (credit is owed, not paid). */
const PAID_METHODS = /** @type {readonly string[]} */ ([
  PAYMENT_METHODS.CASH,
  PAYMENT_METHODS.MPESA,
  PAYMENT_METHODS.CARD,
  PAYMENT_METHODS.CHEQUE,
  PAYMENT_METHODS.CREDIT_NOTE,
]);
Object.freeze(PAID_METHODS);

/** The sum of the paid-at-the-counter amount columns, for sorting by what was paid. */
const TOTAL_PAID_SQL = PAID_METHODS.map(
  (method) =>
    `COALESCE(s.${PAYMENT_COLUMNS[/** @type {keyof typeof PAYMENT_COLUMNS} */ (method)].amount}, 0)`,
).join(' + ');

/** Length of a full M-Pesa transaction code. */
const MPESA_CODE_LENGTH = 10;
/** Card numbers are shown by their last digits only. */
const CARD_DIGITS_SHOWN = 4;

/**
 * @param {string} method
 * @param {string | null} reference
 * @returns {string | null}
 */
const shownReference = (method, reference) =>
  method === PAYMENT_METHODS.CARD && reference && reference.length > CARD_DIGITS_SHOWN
    ? `…${reference.slice(-CARD_DIGITS_SHOWN)}`
    : reference;

/** Sort field -> ORDER BY (a constant, never user input). */
const SORT_SQL = Object.freeze({
  billDate: { asc: 's.BILL_DATE ASC, s.BILL_ID ASC', desc: 's.BILL_DATE DESC, s.BILL_ID DESC' },
  netAmount: { asc: 's.NET_AMOUNT ASC, s.BILL_ID ASC', desc: 's.NET_AMOUNT DESC, s.BILL_ID DESC' },
  totalPaid: {
    asc: `${TOTAL_PAID_SQL} ASC, s.BILL_ID ASC`,
    desc: `${TOTAL_PAID_SQL} DESC, s.BILL_ID DESC`,
  },
  code: { asc: 's.BILL_CODE ASC', desc: 's.BILL_CODE DESC' },
});

export const BILL_SORTABLE = /** @type {const} */ (['billDate', 'netAmount', 'totalPaid', 'code']);

const paymentSelect = Prisma.raw(
  Object.values(PAYMENT_COLUMNS)
    .flatMap(({ amount, reference }) => [`s.${amount}`, ...(reference ? [`s.${reference}`] : [])])
    .join(', '),
);

const SUMMARY_COLUMNS = Prisma.sql`
  s.BILL_ID AS id, s.BILL_CODE AS code, CAST(s.BILL_DATE AS CHAR) AS billDate,
  CAST(s.CREATION_TS AS CHAR) AS createdAt, s.CUSTOMER_NM AS customerName,
  s.CUSTOMER_PHONE_NO AS customerPhone, s.EMPLOYEE_ID AS cashierId,
  TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) AS cashierName,
  s.NET_AMOUNT AS netAmount, s.PAID_AMOUNT AS paidAmount, s.BALANCE_AMOUNT AS balanceAmount,
  s.PAYMENT_STATUS AS paymentStatus, ${paymentSelect},
  (SELECT d.CARD_APPROVAL_CODE FROM ih_sale_payment_detail d WHERE d.BILL_ID = s.BILL_ID) AS cardApprovalCode,
  (SELECT b.BANK_NAME FROM ih_sale_payment_detail d JOIN ih_bank b ON b.BANK_ID = d.CHEQUE_BANK_ID
    WHERE d.BILL_ID = s.BILL_ID) AS chequeBank,
  CAST(s.CHEQUE_DATE AS CHAR) AS chequeDate,
  (SELECT COUNT(*) FROM sales_items i WHERE i.BILL_ID = s.BILL_ID) AS lineCount`;

/**
 * @param {unknown} value
 * @returns {string} Money as `"1250.50"`; empty legacy amounts are zero.
 */
const money = (value) => moneyToString(roundMoney(Number(value ?? 0)));

/**
 * @param {unknown} value
 * @returns {number | null}
 */
const idOrNull = (value) => (value === null || value === undefined ? null : Number(value));

/**
 * @param {unknown} value
 * @returns {string | null} A legacy DATE/TIMESTAMP read as text, or null for an empty or zero date.
 */
const legacyDate = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return text && !text.startsWith('0000') ? text : null;
};

/**
 * @param {string | null} value
 * @returns {string} The status of a legacy bill.
 */
const toStatus = (value) =>
  LEGACY_STATUS[
    /** @type {keyof typeof LEGACY_STATUS} */ (
      String(value ?? '')
        .trim()
        .toLowerCase()
    )
  ] ?? BILL_STATUSES.OTHER;

/**
 * @param {Record<string, any>} row
 * @returns {{ method: string, amount: string, reference: string | null }[]} Each method with an amount.
 */
function paymentsOf(row) {
  return Object.entries(PAYMENT_COLUMNS)
    .filter(([, columns]) => Number(row[columns.amount] ?? 0) > 0)
    .map(([method, columns]) => {
      const stored = columns.reference ? String(row[columns.reference] ?? '').trim() || null : null;
      /** @type {string | null} */
      let reference = shownReference(method, stored);
      // Bills from the new till: the card machine's approval code, and the cheque's bank and date.
      if (method === PAYMENT_METHODS.CARD && row.cardApprovalCode)
        reference = `Approval ${String(row.cardApprovalCode).trim()}`;
      if (method === PAYMENT_METHODS.CHEQUE)
        reference =
          [stored, textOrNull(row.chequeBank), legacyDate(row.chequeDate)]
            .filter(Boolean)
            .join(' · ') || null;
      return { method, amount: money(row[columns.amount]), reference };
    });
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const textOrNull = (value) => String(value ?? '').trim() || null;

/**
 * @param {ReturnType<typeof paymentsOf>} payments
 * @returns {import('@ihealth/shared/money').MoneyValue} What was paid at the counter (credit is owed, not paid).
 */
function paidTotal(payments) {
  return payments
    .filter((payment) => PAID_METHODS.includes(payment.method))
    .reduce((total, payment) => addMoney(total, payment.amount), toMoney(0));
}

/**
 * @param {Record<string, any>} row
 * @param {ReturnType<typeof paymentsOf>} payments
 * @returns {string[]}
 */
function flagsOf(row, payments) {
  /** @type {string[]} */
  const flags = [];
  if (Number(row.lineCount) === 0) flags.push(BILL_FLAGS.NO_ITEMS);
  if (toStatus(row.paymentStatus) === BILL_STATUSES.PAID) {
    const paid = paidTotal(payments);
    // A shilling either way is rounding, not a mismatch.
    if (compareMoney(subtractMoney(paid, money(row.netAmount)).abs(), 1) > 0)
      flags.push(BILL_FLAGS.PAYMENTS_MISMATCH);
  }
  const mpesa = payments.find((payment) => payment.method === PAYMENT_METHODS.MPESA);
  if (mpesa && (mpesa.reference ?? '').length !== MPESA_CODE_LENGTH)
    flags.push(BILL_FLAGS.SHORT_MPESA_CODE);
  return flags;
}

/**
 * @param {Record<string, any>} row
 * @returns {import('zod').infer<typeof import('@ihealth/shared/schemas').billSummarySchema>}
 */
export function toBillSummary(row) {
  const payments = paymentsOf(row);
  return {
    id: Number(row.id),
    code: row.code ?? null,
    billDate: legacyDate(row.billDate),
    createdAt: legacyDate(row.createdAt),
    customerName: String(row.customerName ?? '').trim() || null,
    customerPhone: String(row.customerPhone ?? '').trim() || null,
    cashierId: idOrNull(row.cashierId),
    cashierName: String(row.cashierName ?? '').trim() || null,
    lineCount: Number(row.lineCount),
    netAmount: money(row.netAmount),
    paidAmount: money(row.paidAmount),
    totalPaid: moneyToString(paidTotal(payments)),
    balance: money(row.balanceAmount),
    status: /** @type {any} */ (toStatus(row.paymentStatus)),
    paymentMethods: /** @type {any} */ (payments.map((payment) => payment.method)),
    flags: /** @type {any} */ (flagsOf(row, payments)),
  };
}

/**
 * Legacy status texts of a status, for filtering (MySQL compares them without case).
 *
 * @param {string} status
 * @returns {string[]}
 */
const legacyStatusesOf = (status) =>
  Object.entries(LEGACY_STATUS)
    .filter(([, value]) => value === status)
    .map(([legacy]) => legacy);

/**
 * @param {Record<string, any>} query Validated list query.
 * @param {number} pharmacyId
 * @returns {import('#db').Prisma.Sql}
 */
function whereOf(query, pharmacyId) {
  const conditions = [Prisma.sql`s.PHARMACY_ID = ${pharmacyId}`];
  if (query.q) {
    const like = `%${escapeLike(query.q)}%`;
    conditions.push(
      Prisma.sql`(s.BILL_CODE LIKE ${like} OR s.CUSTOMER_NM LIKE ${like} OR s.CUSTOMER_PHONE_NO LIKE ${like})`,
    );
  }
  if (query.from) conditions.push(Prisma.sql`s.BILL_DATE >= ${query.from}`);
  if (query.to) conditions.push(Prisma.sql`s.BILL_DATE <= ${query.to}`);
  if (query.cashierId) conditions.push(Prisma.sql`s.EMPLOYEE_ID = ${query.cashierId}`);
  if (query.paymentMethod) {
    const column =
      PAYMENT_COLUMNS[/** @type {keyof typeof PAYMENT_COLUMNS} */ (query.paymentMethod)];
    conditions.push(Prisma.sql`s.${Prisma.raw(column.amount)} > 0`);
  }
  if (query.status === BILL_STATUSES.OTHER) {
    conditions.push(
      Prisma.sql`(s.PAYMENT_STATUS IS NULL OR LOWER(TRIM(s.PAYMENT_STATUS)) NOT IN (${Prisma.join(Object.keys(LEGACY_STATUS))}))`,
    );
  } else if (query.status) {
    conditions.push(
      Prisma.sql`LOWER(TRIM(s.PAYMENT_STATUS)) IN (${Prisma.join(legacyStatusesOf(query.status))})`,
    );
  }
  return Prisma.join(conditions, ' AND ');
}

/**
 * Reads past bills from the legacy `sales` tables. Raw SQL: some legacy timestamps are zero dates,
 * which fail a whole read through the models, and the list needs joins and a line count per bill.
 *
 * @param {import('#db').PrismaClient} prisma
 * @returns The repository.
 */
export function createBillsRepository(prisma) {
  return {
    /**
     * @param {Record<string, any>} query Validated list query (page, pageSize, sort, q, filters).
     * @param {number} pharmacyId
     * @returns {Promise<{ rows: Record<string, any>[], total: number }>}
     */
    async list(query, pharmacyId) {
      const where = whereOf(query, pharmacyId);
      const order = Prisma.raw(
        SORT_SQL[/** @type {keyof typeof SORT_SQL} */ (query.sort.field)][
          /** @type {'asc' | 'desc'} */ (query.sort.direction)
        ],
      );
      const offset = (query.page - 1) * query.pageSize;
      const [rows, counts] = await Promise.all([
        prisma.$queryRaw`
          SELECT ${SUMMARY_COLUMNS}
          FROM sales s LEFT JOIN employee e ON e.EMPLOYEE_ID = s.EMPLOYEE_ID
          WHERE ${where} ORDER BY ${order} LIMIT ${query.pageSize} OFFSET ${offset}`,
        prisma.$queryRaw`SELECT COUNT(*) AS total FROM sales s WHERE ${where}`,
      ]);
      const [count] = /** @type {{ total: bigint | number }[]} */ (counts);
      return { rows: /** @type {any[]} */ (rows), total: Number(count.total) };
    },

    /**
     * @param {number} billId
     * @param {number} pharmacyId
     * @returns {Promise<{ bill: Record<string, any>, lines: Record<string, any>[] } | null>}
     */
    async find(billId, pharmacyId) {
      /** @type {Record<string, any>[]} */
      const [bill] = await prisma.$queryRaw`
        SELECT ${SUMMARY_COLUMNS},
          s.TOTAL_AMOUNT AS totalAmount, s.OVERALL_DISCOUNT AS discountAmount, s.VAT_AMT AS vatAmount,
          s.ROUNDED_OFF AS roundedOff, s.REMARKS AS remarks, CAST(s.PRESCIPTION_DATE AS CHAR) AS prescriptionDate,
          TRIM(CONCAT_WS(' ', p.FIRST_NM, p.LAST_NM)) AS prescriberName, h.NAME AS hospitalName,
          TRIM(CONCAT_WS(' ', cu.FIRST_NM, cu.LAST_NM)) AS createdBy,
          TRIM(CONCAT_WS(' ', uu.FIRST_NM, uu.LAST_NM)) AS updatedBy,
          CAST(s.LAST_UPDATE_TS AS CHAR) AS updatedAt
        FROM sales s
          LEFT JOIN employee e ON e.EMPLOYEE_ID = s.EMPLOYEE_ID
          LEFT JOIN provider p ON p.PROVIDER_ID = s.PROVIDER_ID
          LEFT JOIN hospital h ON h.HOSPITAL_ID = s.HOSPITAL_ID
          LEFT JOIN employee cu ON cu.EMPLOYEE_ID = s.CREATION_USER_ID
          LEFT JOIN employee uu ON uu.EMPLOYEE_ID = s.LAST_UPDATE_USER_ID
        WHERE s.BILL_ID = ${billId} AND s.PHARMACY_ID = ${pharmacyId}`;
      if (!bill) return null;
      /** @type {Record<string, any>[]} */
      const lines = await prisma.$queryRaw`
        SELECT i.SALES_ITEMS_ID AS id, i.ITEM_ID AS itemId, it.ITEM_NM AS itemName, it.ITEM_CD AS itemCode,
          COALESCE(i.BATCH_NO, st.BATCH_NO) AS batchNo, CAST(st.EXPIRY_DT AS CHAR) AS expiryDate,
          i.SALE_QTY AS quantity, i.UNIT_SALE_PRICE AS unitPrice, COALESCE(i.SP_VAT, i.MRP) AS labelPrice,
          i.DISCOUNT_PERCENTAGE AS discountPercent, i.VAT AS vatPercent, i.SALE_AMOUNT AS amount,
          tc.CATEGORY_CODE AS taxCode
        FROM sales_items i
          LEFT JOIN items it ON it.ITEM_ID = i.ITEM_ID
          LEFT JOIN stock st ON st.STOCK_ID = i.STOCK_ID
          LEFT JOIN taxcategory tc ON tc.TAXCATEGORY_ID = i.TAX_CATEGORY_ID
        WHERE i.BILL_ID = ${billId}
        ORDER BY i.SALES_ITEMS_ID`;
      return { bill, lines };
    },

    /**
     * People who have made bills, for the cashier filter.
     *
     * @param {number} pharmacyId
     * @returns {Promise<{ id: number, name: string }[]>}
     */
    async cashiers(pharmacyId) {
      /** @type {{ id: number, name: string | null }[]} */
      const rows = await prisma.$queryRaw`
        SELECT e.EMPLOYEE_ID AS id, TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) AS name
        FROM employee e
        WHERE e.EMPLOYEE_ID IN (SELECT DISTINCT s.EMPLOYEE_ID FROM sales s WHERE s.PHARMACY_ID = ${pharmacyId})
        ORDER BY name`;
      return rows.map((row) => ({ id: Number(row.id), name: row.name || `#${row.id}` }));
    },
  };
}

/**
 * @param {{ bill: Record<string, any>, lines: Record<string, any>[] }} found
 * @returns {import('zod').infer<typeof import('@ihealth/shared/schemas').billDetailSchema>}
 */
export function toBillDetail({ bill, lines }) {
  const summary = toBillSummary(bill);
  return {
    ...summary,
    prescriberName: String(bill.prescriberName ?? '').trim() || null,
    hospitalName: String(bill.hospitalName ?? '').trim() || null,
    prescriptionDate: legacyDate(bill.prescriptionDate),
    remarks: String(bill.remarks ?? '').trim() || null,
    totals: {
      gross: money(bill.totalAmount),
      discount: money(bill.discountAmount),
      vat: money(bill.vatAmount),
      roundedOff: money(bill.roundedOff),
      net: summary.netAmount,
      paid: summary.paidAmount,
      balance: summary.balance,
    },
    lines: lines.map((line) => {
      const expiryDate = legacyDate(line.expiryDate);
      return {
        id: Number(line.id),
        itemId: idOrNull(line.itemId),
        itemName: String(line.itemName ?? '').trim() || null,
        itemCode: String(line.itemCode ?? '').trim() || null,
        batchNo: String(line.batchNo ?? '').trim() || null,
        expiryDate,
        expiredWhenSold: Boolean(expiryDate && summary.billDate && expiryDate < summary.billDate),
        quantity: Number(line.quantity ?? 0),
        unitPrice: money(line.unitPrice),
        labelPrice: money(line.labelPrice),
        discountPercent: Number(line.discountPercent ?? 0),
        vatPercent: Number(line.vatPercent ?? 0),
        taxCode: String(line.taxCode ?? '').trim() || null,
        amount: money(line.amount),
      };
    }),
    payments: /** @type {any} */ (paymentsOf(bill)),
    audit: {
      createdBy: String(bill.createdBy ?? '').trim() || null,
      createdAt: summary.createdAt,
      updatedBy: String(bill.updatedBy ?? '').trim() || null,
      updatedAt: legacyDate(bill.updatedAt),
    },
  };
}
