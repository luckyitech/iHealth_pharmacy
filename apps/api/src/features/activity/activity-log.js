/* eslint-disable jsdoc/reject-any-type -- rows come from raw SQL over the additive table */
import { fromDbTime } from '#db';

/**
 * @typedef {object} ActivityLine
 * @property {string} subjectType One of ACTIVITY_SUBJECTS.
 * @property {string | number} subjectId
 * @property {string} action One of ACTIVITY_ACTIONS.
 * @property {number | null} employeeId The signed-in person who did it.
 * @property {number | null} [pharmacyId]
 * @property {Record<string, unknown>} [details] What changed; never a password or PIN.
 */

/**
 * @param {unknown} value JSON as text or already parsed, depending on the driver.
 * @returns {Record<string, unknown>}
 */
const parseDetails = (value) =>
  value === null || value === undefined
    ? {}
    : /** @type {Record<string, unknown>} */ (
        typeof value === 'string' ? JSON.parse(value) : value
      );

/**
 * @param {Record<string, any>} row
 * @returns {import('@ihealth/shared/schemas').ActivityEntry}
 */
export const toActivityEntry = (row) => ({
  id: String(row.id),
  subjectType: String(row.subjectType),
  subjectId: String(row.subjectId),
  action: String(row.action),
  by: String(row.byName ?? '').trim() || null,
  // Stamped by the database clock: the pharmacy's wall clock.
  at: fromDbTime(row.at).toISOString(),
  details: parseDetails(row.details),
});

/**
 * The pharmacy's history of who did what and when. Lines are only ever added: written in the same
 * transaction as the step they describe, so a step and its line stand or fall together.
 *
 * @param {import('#db').PrismaClient} prisma
 * @returns The history.
 */
export function createActivityLog(prisma) {
  return {
    /**
     * @param {ActivityLine} line
     * @param {{ $executeRaw: import('#db').PrismaClient['$executeRaw'] }} [client] A transaction client.
     * @returns {Promise<void>}
     */
    async record(
      { subjectType, subjectId, action, employeeId, pharmacyId = null, details },
      client = prisma,
    ) {
      await client.$executeRaw`
        INSERT INTO ih_activity (PHARMACY_ID, SUBJECT_TYPE, SUBJECT_ID, ACTION, EMPLOYEE_ID, DETAILS)
        VALUES (${pharmacyId}, ${subjectType}, ${String(subjectId)}, ${action}, ${employeeId},
          ${details ? JSON.stringify(details) : null})`;
    },

    /**
     * A record's history, oldest first.
     *
     * @param {string} subjectType
     * @param {string | number} subjectId
     * @param {number} limit
     * @returns {Promise<import('@ihealth/shared/schemas').ActivityEntry[]>}
     */
    async of(subjectType, subjectId, limit) {
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT a.ACTIVITY_ID AS id, a.SUBJECT_TYPE AS subjectType, a.SUBJECT_ID AS subjectId,
          a.ACTION AS action, a.OCCURRED_AT AS at, a.DETAILS AS details,
          TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) AS byName
        FROM ih_activity a LEFT JOIN employee e ON e.EMPLOYEE_ID = a.EMPLOYEE_ID
        WHERE a.SUBJECT_TYPE = ${subjectType} AND a.SUBJECT_ID = ${String(subjectId)}
        ORDER BY a.OCCURRED_AT, a.ACTIVITY_ID LIMIT ${limit}`;
      return rows.map(toActivityEntry);
    },

    /**
     * The latest lines of one kind of record in the pharmacy, newest first (e.g. today's recalled
     * and deleted held sales). "Today" is the database clock's: the pharmacy's wall clock.
     *
     * @param {string} subjectType
     * @param {{ pharmacyId: number | null, todayOnly?: boolean, limit: number }} options
     * @returns {Promise<import('@ihealth/shared/schemas').ActivityEntry[]>}
     */
    async latest(subjectType, { pharmacyId, todayOnly = false, limit }) {
      /** @type {Record<string, any>[]} */
      const rows = await prisma.$queryRaw`
        SELECT a.ACTIVITY_ID AS id, a.SUBJECT_TYPE AS subjectType, a.SUBJECT_ID AS subjectId,
          a.ACTION AS action, a.OCCURRED_AT AS at, a.DETAILS AS details,
          TRIM(CONCAT_WS(' ', e.FIRST_NM, e.LAST_NM)) AS byName
        FROM ih_activity a LEFT JOIN employee e ON e.EMPLOYEE_ID = a.EMPLOYEE_ID
        WHERE a.SUBJECT_TYPE = ${subjectType} AND (a.PHARMACY_ID <=> ${pharmacyId})
          AND (${!todayOnly} OR a.OCCURRED_AT >= CURDATE())
        ORDER BY a.OCCURRED_AT DESC, a.ACTIVITY_ID DESC LIMIT ${limit}`;
      return rows.map(toActivityEntry);
    },
  };
}

/** @typedef {ReturnType<typeof createActivityLog>} ActivityLog */
