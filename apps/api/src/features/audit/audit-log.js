import { getRequestContext } from '../../lib/request-context.js';

export const AUDIT_OUTCOMES = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
  DENIED: 'denied',
});

/**
 * @typedef {object} AuditEntry
 * @property {string} action e.g. `auth.login`
 * @property {'success' | 'failure' | 'denied'} outcome
 * @property {number | null} [employeeId] Defaults to the authenticated employee of the request.
 * @property {string} [resourceType]
 * @property {string | number} [resourceId]
 * @property {string} [ipAddress]
 * @property {string} [userAgent]
 * @property {Record<string, unknown>} [details] Never put secrets or health data here.
 */

/**
 * Append-only audit trail in ih_audit_log. Recording never fails the request: if the insert fails,
 * the entry is logged at error level instead.
 *
 * @param {{ $executeRaw: import('@ihealth/db').PrismaClient['$executeRaw'] }} prisma
 * @param {import('pino').Logger} logger
 * @returns The audit log ({ record }).
 */
export function createAuditLog(prisma, logger) {
  return {
    /**
     * @param {AuditEntry} entry
     * @returns {Promise<void>}
     */
    async record(entry) {
      const context = getRequestContext();
      const employeeId =
        entry.employeeId === undefined ? (context?.employeeId ?? null) : entry.employeeId;
      try {
        await prisma.$executeRaw`
          INSERT INTO ih_audit_log
            (REQUEST_ID, EMPLOYEE_ID, ACTION, OUTCOME, RESOURCE_TYPE, RESOURCE_ID, IP_ADDRESS, USER_AGENT, DETAILS)
          VALUES (${context?.requestId ?? null}, ${employeeId}, ${entry.action}, ${entry.outcome},
                  ${entry.resourceType ?? null}, ${entry.resourceId === undefined ? null : String(entry.resourceId)},
                  ${entry.ipAddress?.slice(0, 45) ?? null}, ${entry.userAgent?.slice(0, 255) ?? null},
                  ${entry.details ? JSON.stringify(entry.details) : null})`;
      } catch (error) {
        logger.error({ err: error, audit: { ...entry, employeeId } }, 'Failed to write audit log');
      }
    },
  };
}

/** @typedef {ReturnType<typeof createAuditLog>} AuditLog */
