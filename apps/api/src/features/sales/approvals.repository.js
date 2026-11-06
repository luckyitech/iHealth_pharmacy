/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over the additive table */
import { fromDbTime, Prisma } from '#db';

import { escapeLike } from '../../lib/sql-like.js';

/** Sortable fields of the approvals list -> SQL. */
export const APPROVAL_SORTABLE = /** @type {const} */ (['at', 'givenAway']);
const APPROVAL_SORT_COLUMNS = Object.freeze({
  at: Prisma.sql`a.CREATED_AT`,
  givenAway: Prisma.sql`a.GIVEN_AWAY`,
});

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const textOrNull = (value) => String(value ?? '').trim() || null;

/**
 * @param {unknown} value JSON as text or already parsed, depending on the driver.
 * @returns {any[]}
 */
const parsed = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const items = JSON.parse(String(value ?? '[]'));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
};

const COLUMNS = Prisma.sql`
  a.APPROVAL_ID AS id, a.KIND AS kind, a.CREATED_AT AS at, a.BILL_ID AS billId, s.BILL_CODE AS billCode,
  TRIM(CONCAT_WS(' ', rq.FIRST_NM, rq.LAST_NM)) AS requestedBy,
  TRIM(CONCAT_WS(' ', ap.FIRST_NM, ap.LAST_NM)) AS approvedBy,
  a.REASON AS reason, a.DETAILS AS details, a.GIVEN_AWAY AS givenAway, a.USED_AT AS usedAt
  FROM ih_sale_approval a
    LEFT JOIN sales s ON s.BILL_ID = a.BILL_ID
    LEFT JOIN employee rq ON rq.EMPLOYEE_ID = a.REQUESTED_BY
    LEFT JOIN employee ap ON ap.EMPLOYEE_ID = a.APPROVED_BY`;

/**
 * @param {Record<string, any>} row
 * @returns {import('zod').infer<typeof import('@ihealth/shared/schemas').billApprovalSchema>}
 */
const toApproval = (row) => ({
  id: Number(row.id),
  kind: row.kind,
  // CREATED_AT is the database clock's: the pharmacy's wall clock.
  at: fromDbTime(row.at).toISOString(),
  billId: row.billId === null ? null : Number(row.billId),
  billCode: textOrNull(row.billCode),
  requestedBy: textOrNull(row.requestedBy),
  approvedBy: textOrNull(row.approvedBy),
  reason: String(row.reason ?? ''),
  items: parsed(row.details).map((item) => ({
    stockId: Number(item.stockId),
    itemName: textOrNull(item.itemName),
    reasons: Array.isArray(item.reasons) ? item.reasons : [],
    givenAway: String(item.givenAway ?? '0.00'),
  })),
  givenAway: Number(row.givenAway ?? 0).toFixed(2),
  used: row.usedAt !== null && row.usedAt !== undefined,
});

/**
 * Approvals as Sales history and the daily report show them. A bill lists the approvals it used;
 * the day's report also lists approvals given but never used (the sale was not completed), marked
 * so, because someone still approved them.
 *
 * @param {import('#db').PrismaClient} prisma
 * @returns The repository.
 */
export function createApprovalsRepository(prisma) {
  return {
    /**
     * @param {number} billId
     * @returns {Promise<ReturnType<typeof toApproval>[]>} Oldest first.
     */
    async ofBill(billId) {
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT ${COLUMNS} WHERE a.BILL_ID = ${billId} AND a.USED_AT IS NOT NULL
        ORDER BY a.CREATED_AT, a.APPROVAL_ID`;
      return rows.map(toApproval);
    },

    /**
     * Approvals, newest first by default: search, filters, sort and page.
     *
     * @param {{ page: number, pageSize: number, sort: { field: string, direction: 'asc' | 'desc' }, q?: string, from?: string, to?: string, kind?: string, approverId?: number }} query
     * @param {number} pharmacyId
     * @returns {Promise<{ rows: ReturnType<typeof toApproval>[], total: number }>}
     */
    async list(query, pharmacyId) {
      const like = query.q ? `%${escapeLike(query.q)}%` : null;
      const conditions = [
        Prisma.sql`a.PHARMACY_ID = ${pharmacyId}`,
        // Dates are the database clock's: the pharmacy's wall clock.
        query.from ? Prisma.sql`a.CREATED_AT >= ${query.from}` : null,
        query.to ? Prisma.sql`a.CREATED_AT < DATE_ADD(${query.to}, INTERVAL 1 DAY)` : null,
        query.kind ? Prisma.sql`a.KIND = ${query.kind}` : null,
        query.approverId ? Prisma.sql`a.APPROVED_BY = ${query.approverId}` : null,
        like
          ? Prisma.sql`(s.BILL_CODE LIKE ${like} OR a.REASON LIKE ${like}
              OR CONCAT_WS(' ', rq.FIRST_NM, rq.LAST_NM) LIKE ${like}
              OR CONCAT_WS(' ', ap.FIRST_NM, ap.LAST_NM) LIKE ${like})`
          : null,
      ].filter((condition) => condition !== null);
      const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
      const order =
        APPROVAL_SORT_COLUMNS[
          /** @type {keyof typeof APPROVAL_SORT_COLUMNS} */ (query.sort.field)
        ] ?? APPROVAL_SORT_COLUMNS.at;
      const direction = query.sort.direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT ${COLUMNS} ${where}
        ORDER BY ${order} ${direction}, a.APPROVAL_ID ${direction}
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
      /** @type {{ total: bigint | number }[]} */
      const [count] = await prisma.$queryRaw`
        SELECT COUNT(*) AS total
        FROM ih_sale_approval a
          LEFT JOIN sales s ON s.BILL_ID = a.BILL_ID
          LEFT JOIN employee rq ON rq.EMPLOYEE_ID = a.REQUESTED_BY
          LEFT JOIN employee ap ON ap.EMPLOYEE_ID = a.APPROVED_BY
        ${where}`;
      return { rows: rows.map(toApproval), total: Number(count?.total ?? 0) };
    },

    /**
     * The people who have approved, for the approver filter.
     *
     * @param {number} pharmacyId
     * @returns {Promise<{ id: number, name: string }[]>}
     */
    async approvers(pharmacyId) {
      /** @type {{ id: number, name: string }[]} */
      const rows = await prisma.$queryRaw`
        SELECT DISTINCT e.EMPLOYEE_ID AS id, TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) AS name
        FROM ih_sale_approval a JOIN employee e ON e.EMPLOYEE_ID = a.APPROVED_BY
        WHERE a.PHARMACY_ID = ${pharmacyId} ORDER BY name`;
      return rows.map((row) => ({ id: Number(row.id), name: String(row.name) }));
    },
  };
}
