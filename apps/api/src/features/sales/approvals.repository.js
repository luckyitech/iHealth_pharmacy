/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over the additive table */
import { fromDbTime, Prisma } from '#db';

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
     * @param {number} pharmacyId
     * @param {string} date `YYYY-MM-DD`, in the database's time zone (the pharmacy's).
     * @returns {Promise<ReturnType<typeof toApproval>[]>} Newest first.
     */
    async ofDay(pharmacyId, date) {
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT ${COLUMNS}
        WHERE a.PHARMACY_ID = ${pharmacyId}
          AND a.CREATED_AT >= ${date} AND a.CREATED_AT < DATE_ADD(${date}, INTERVAL 1 DAY)
        ORDER BY a.CREATED_AT DESC, a.APPROVAL_ID DESC`;
      return rows.map(toApproval);
    },
  };
}
