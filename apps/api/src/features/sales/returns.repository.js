/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over legacy and additive tables */
import { moneyToString, roundMoney } from '@ihealth/shared/money';
import { CREDIT_NOTE_STATES } from '@ihealth/shared/schemas';

import { Prisma } from '#db';

import { escapeLike } from '../../lib/sql-like.js';
import { LEGACY_REFUNDS } from './returns.js';

/** How the legacy app recorded the way money went back (payment_types.TYPE), for its own returns. */
const LEGACY_METHODS = Object.freeze(
  Object.fromEntries(
    Object.entries(LEGACY_REFUNDS).map(([method, legacy]) => [legacy.paymentType, method]),
  ),
);
/** Notes the legacy app gave to suppliers are not shown with the customers' ones. */
const LEGACY_PURCHASE = 'Purchase';
const LEGACY_OPEN = 'pending';
const LEGACY_ACTIVE = 'Y';

/** Sortable fields of the returns list -> SQL. */
export const RETURN_SORTABLE = /** @type {const} */ (['at', 'code', 'refund']);
const RETURN_SORT_COLUMNS = Object.freeze({
  at: Prisma.sql`COALESCE(x.CREATED_AT, r.SALES_RETURN_DATE)`,
  code: Prisma.sql`r.SALES_RETURN_NO`,
  refund: Prisma.sql`r.TOTAL_AMOUNT`,
});

/** Sortable fields of the credit note list -> SQL. */
export const CREDIT_NOTE_SORTABLE = /** @type {const} */ (['issuedOn', 'code', 'balance']);
/** The list is sorted on the outer query, by these columns of the inner one. */
const SORT_COLUMNS = Object.freeze({
  issuedOn: Prisma.sql`issuedOn`,
  code: Prisma.sql`code`,
  balance: Prisma.sql`balance`,
});

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const text = (value) => String(value ?? '').trim() || null;
/**
 * @param {unknown} value
 * @returns {string}
 */
const money = (value) => moneyToString(roundMoney(Number(value ?? 0)));

/**
 * Reading returns and credit notes for the Returns page: the returns (the legacy app's too),
 * credit notes with what is left on each, and each time a note paid for a bill.
 *
 * @param {import('#db').PrismaClient} prisma
 * @returns The repository.
 */
export function createReturnsRepository(prisma) {
  return {
    /**
     * Returns, newest first by default, the legacy app's included: search, filters, sort and page.
     *
     * @param {{ page: number, pageSize: number, sort: { field: string, direction: 'asc' | 'desc' }, q?: string, from?: string, to?: string, refundMethod?: string, approverId?: number }} query
     * @param {number} pharmacyId
     * @returns {Promise<{ rows: import('zod').infer<typeof import('@ihealth/shared/schemas').returnSummarySchema>[], total: number }>}
     */
    async list(query, pharmacyId) {
      const like = query.q ? `%${escapeLike(query.q)}%` : null;
      const legacyType = query.refundMethod
        ? /** @type {Record<string, { paymentType: string }>} */ (LEGACY_REFUNDS)[
            query.refundMethod
          ]?.paymentType
        : undefined;
      const conditions = [
        Prisma.sql`s.PHARMACY_ID = ${pharmacyId}`,
        query.from ? Prisma.sql`r.SALES_RETURN_DATE >= ${query.from}` : null,
        query.to ? Prisma.sql`r.SALES_RETURN_DATE <= ${query.to}` : null,
        query.refundMethod
          ? Prisma.sql`(x.REFUND_METHOD = ${query.refundMethod}
              OR (x.SALES_RETURN_ID IS NULL AND UPPER(pt.TYPE) = UPPER(${legacyType ?? ''})))`
          : null,
        query.approverId ? Prisma.sql`x.APPROVED_BY = ${query.approverId}` : null,
        like
          ? Prisma.sql`(r.SALES_RETURN_NO LIKE ${like} OR s.BILL_CODE LIKE ${like}
              OR s.CUSTOMER_NM LIKE ${like} OR s.CUSTOMER_PHONE_NO LIKE ${like})`
          : null,
      ].filter((condition) => condition !== null);
      const from = Prisma.sql`
        FROM sales_return r
          JOIN sales s ON s.BILL_ID = r.BILL_ID
          LEFT JOIN ih_sale_return x ON x.SALES_RETURN_ID = r.SALES_RETURN_ID
          LEFT JOIN payment_types pt ON pt.PAYMENT_TYPE_ID = r.PAYMENT_TYPE_ID
        WHERE ${Prisma.join(conditions, ' AND ')}`;
      const order =
        RETURN_SORT_COLUMNS[/** @type {keyof typeof RETURN_SORT_COLUMNS} */ (query.sort.field)] ??
        RETURN_SORT_COLUMNS.at;
      const direction = query.sort.direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT r.SALES_RETURN_ID AS id, r.SALES_RETURN_NO AS code,
          CAST(COALESCE(x.CREATED_AT, r.SALES_RETURN_DATE) AS CHAR) AS at,
          r.BILL_ID AS billId, s.BILL_CODE AS billCode, s.CUSTOMER_NM AS customerName,
          s.CUSTOMER_PHONE_NO AS customerPhone,
          (SELECT COUNT(*) FROM sales_return_item ri WHERE ri.SALES_RETURN_ID = r.SALES_RETURN_ID) AS lineCount,
          r.TOTAL_AMOUNT AS refund, x.REFUND_METHOD AS refundMethod, UPPER(pt.TYPE) AS paymentType,
          COALESCE(x.REASON, r.REMARKS) AS reason, x.SALES_RETURN_ID AS ours,
          (SELECT TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) FROM employee e
            WHERE e.EMPLOYEE_ID = COALESCE(x.REQUESTED_BY, r.CREATION_USER_ID)) AS requestedBy,
          (SELECT TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) FROM employee e
            WHERE e.EMPLOYEE_ID = x.APPROVED_BY) AS approvedBy
        ${from}
        ORDER BY ${order} ${direction}, r.SALES_RETURN_ID ${direction}
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
      /** @type {{ total: bigint | number }[]} */
      const [count] = await prisma.$queryRaw`SELECT COUNT(*) AS total ${from}`;
      return {
        rows: rows.map((row) => ({
          id: Number(row.id),
          code: String(row.code),
          at: text(row.at),
          billId: Number(row.billId),
          billCode: text(row.billCode),
          customerName: text(row.customerName),
          customerPhone: text(row.customerPhone),
          lineCount: Number(row.lineCount ?? 0),
          refund: money(row.refund),
          refundMethod: row.refundMethod ?? LEGACY_METHODS[String(row.paymentType ?? '')] ?? null,
          reason: text(row.reason),
          requestedBy: text(row.requestedBy),
          approvedBy: text(row.approvedBy),
          hasReceipt: row.ours !== null,
        })),
        total: Number(count?.total ?? 0),
      };
    },

    /**
     * The people who approved returns, for the approver filter.
     *
     * @param {number} pharmacyId
     * @returns {Promise<{ id: number, name: string }[]>}
     */
    async approvers(pharmacyId) {
      /** @type {{ id: number, name: string }[]} */
      const rows = await prisma.$queryRaw`
        SELECT DISTINCT e.EMPLOYEE_ID AS id, TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) AS name
        FROM ih_sale_return x JOIN employee e ON e.EMPLOYEE_ID = x.APPROVED_BY
        WHERE x.PHARMACY_ID = ${pharmacyId} ORDER BY name`;
      return rows.map((row) => ({ id: Number(row.id), name: String(row.name) }));
    },

    /**
     * @param {{ page: number, pageSize: number, sort: { field: string, direction: 'asc' | 'desc' }, q?: string, from?: string, to?: string, state?: string }} query
     * @param {{ today: string }} context
     * @returns {Promise<{ rows: import('zod').infer<typeof import('@ihealth/shared/schemas').creditNoteSummarySchema>[], total: number }>}
     */
    async creditNotes(query, { today }) {
      const like = query.q ? `%${escapeLike(query.q)}%` : null;
      const base = Prisma.sql`
        SELECT c.credit_note_id AS id, c.credit_note_no AS code, CAST(c.credit_date AS CHAR) AS issuedOn,
          c.amount AS amount, COALESCE(n.BALANCE, c.amount) AS balance, CAST(n.EXPIRES_ON AS CHAR) AS expiresOn,
          c.bill_id AS originalBillCode, TRIM(CONCAT_WS(' ', cu.FIRST_NM, cu.LAST_NM)) AS customerName,
          CAST(c.CREATION_TS AS CHAR) AS issuedAt,
          NULLIF(TRIM(CONCAT_WS(' ', ie.FIRST_NM, ie.LAST_NM)), '') AS issuedBy,
          NULLIF(TRIM(CONCAT_WS(' ', ae.FIRST_NM, ae.LAST_NM)), '') AS approvedBy,
          CASE
            WHEN COALESCE(c.ACTIVE_S, ${LEGACY_ACTIVE}) <> ${LEGACY_ACTIVE} THEN ${CREDIT_NOTE_STATES.CANCELLED}
            WHEN LOWER(COALESCE(c.PAYMENT_STATUS, '')) <> ${LEGACY_OPEN} OR COALESCE(n.BALANCE, c.amount) <= 0
              THEN ${CREDIT_NOTE_STATES.USED_UP}
            WHEN n.EXPIRES_ON < ${today} THEN ${CREDIT_NOTE_STATES.EXPIRED}
            ELSE ${CREDIT_NOTE_STATES.OPEN}
          END AS state
        FROM credit_note c
          LEFT JOIN ih_credit_note n ON n.CREDIT_NOTE_ID = c.credit_note_id
          LEFT JOIN customer cu ON cu.CUSTOMER_ID = c.CUSTOMER_ID
          LEFT JOIN employee ie ON ie.EMPLOYEE_ID = c.CREATION_USER_ID
          LEFT JOIN employee ae ON ae.EMPLOYEE_ID = c.APPROVED_BY
        WHERE COALESCE(c.return_type, '') <> ${LEGACY_PURCHASE} AND c.SUPPLIER_ID IS NULL
          ${like ? Prisma.sql`AND (c.credit_note_no LIKE ${like} OR CONCAT_WS(' ', cu.FIRST_NM, cu.LAST_NM) LIKE ${like} OR c.bill_id LIKE ${like})` : Prisma.empty}
          ${query.from ? Prisma.sql`AND c.credit_date >= ${query.from}` : Prisma.empty}
          ${query.to ? Prisma.sql`AND c.credit_date <= ${query.to}` : Prisma.empty}`;
      const filtered = Prisma.sql`SELECT * FROM (${base}) notes ${query.state ? Prisma.sql`WHERE state = ${query.state}` : Prisma.empty}`;
      const order =
        SORT_COLUMNS[/** @type {keyof typeof SORT_COLUMNS} */ (query.sort.field)] ??
        SORT_COLUMNS.issuedOn;
      const direction = query.sort.direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        ${filtered} ORDER BY ${order} ${direction}, id DESC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
      /** @type {{ total: bigint | number }[]} */
      const [count] = await prisma.$queryRaw`SELECT COUNT(*) AS total FROM (${filtered}) counted`;
      return {
        rows: rows.map((row) => ({
          id: Number(row.id),
          code: String(row.code),
          issuedOn: text(row.issuedOn),
          issuedAt: text(row.issuedAt),
          issuedBy: text(row.issuedBy),
          approvedBy: text(row.approvedBy),
          customerName: text(row.customerName),
          amount: money(row.amount),
          balance: money(row.balance),
          expiresOn: text(row.expiresOn),
          originalBillCode: text(row.originalBillCode),
          state: /** @type {any} */ (row.state),
        })),
        total: Number(count.total),
      };
    },

    /**
     * @param {string} code
     * @returns {Promise<import('zod').infer<typeof import('@ihealth/shared/schemas').creditNoteUseSchema>[]>}
     */
    async usesOf(code) {
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT u.BILL_ID AS billId, s.BILL_CODE AS billCode, CAST(u.USED_AT AS CHAR) AS usedAt,
          u.AMOUNT AS amount, u.BALANCE_AFTER AS balanceAfter,
          TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) AS usedBy
        FROM ih_credit_note_use u
          JOIN credit_note c ON c.credit_note_id = u.CREDIT_NOTE_ID
          LEFT JOIN sales s ON s.BILL_ID = u.BILL_ID
          LEFT JOIN employee e ON e.EMPLOYEE_ID = u.USED_BY
        WHERE c.credit_note_no = ${code.trim().toUpperCase()}
        ORDER BY u.USED_AT`;
      return rows.map((row) => ({
        billId: Number(row.billId),
        billCode: text(row.billCode),
        usedAt: String(row.usedAt),
        amount: money(row.amount),
        balanceAfter: money(row.balanceAfter),
        usedBy: text(row.usedBy),
      }));
    },
  };
}
