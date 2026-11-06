/**
 * Data access for administering staff accounts: sign-in details, role and individual permissions.
 * Legacy tables go through the Prisma models; the additive `ih_*` tables use parameterised raw queries.
 */
import { toDbTime } from '#db';

/** @typedef {import('#db').PrismaClient} PrismaClient */
/** @typedef {Pick<PrismaClient, '$executeRaw' | '$queryRaw' | 'employeeCredentials' | 'employeeAccess' | 'employeePharmacyRole' | 'twoFactorTrustedDevice' | 'twoFactorChallenge' | 'twoFactorResetAudit'>} Client */

const FLAG_YES = 'Y';
const FLAG_NO = 'N';

/** Legacy reasons and purposes of the two-factor tables (as the legacy reset writes them). */
const TWO_FACTOR = Object.freeze({ REVOKED_BY_ADMIN_RESET: 'ADMIN_RESET', PURPOSE_LOGIN: 'LOGIN' });

/**
 * @param {PrismaClient} prisma
 * @returns The repository.
 */
export function createAccountAdminRepository(prisma) {
  return {
    /**
     * @param {{ employeeId: number, username: string, legacyPassword: string, by: string }} account
     * @param {Client} [client]
     * @returns {Promise<number>} The new credentials id.
     */
    async createCredentials({ employeeId, username, legacyPassword, by }, client = prisma) {
      const now = new Date();
      const row = await client.employeeCredentials.create({
        data: {
          employeeId,
          userNm: username,
          currentPassword: legacyPassword,
          activeS: FLAG_YES,
          twoFactorEnabledS: FLAG_NO,
          creationUserId: by,
          creationTs: toDbTime(now),
          lastUpdateUserId: by,
          lastUpdateTs: toDbTime(now),
        },
        select: { employeeCredentialsId: true },
      });
      return row.employeeCredentialsId;
    },

    /**
     * @param {number} credentialsId
     * @param {{ username?: string, active?: boolean }} changes
     * @param {string} by
     * @param {Client} [client]
     * @returns {Promise<void>}
     */
    async updateCredentials(credentialsId, { username, active }, by, client = prisma) {
      await client.employeeCredentials.update({
        where: { employeeCredentialsId: credentialsId },
        data: {
          ...(username === undefined ? {} : { userNm: username }),
          ...(active === undefined ? {} : { activeS: active ? FLAG_YES : FLAG_NO }),
          lastUpdateUserId: by,
          lastUpdateTs: toDbTime(),
        },
      });
    },

    /**
     * Turns two-factor sign-in off the way the legacy administrator reset does: trusted devices are
     * revoked, the enrolment is cleared, open codes are closed and the reset is logged.
     *
     * @param {{ credentialsId: number, resetBy: number, reason: string }} reset
     * @param {Client} client A transaction client.
     * @returns {Promise<{ devicesRevoked: number }>}
     */
    async resetTwoFactor({ credentialsId, resetBy, reason }, client) {
      const now = new Date();
      const account = await client.employeeCredentials.findUnique({
        where: { employeeCredentialsId: credentialsId },
        select: { twoFactorEmail: true },
      });
      const { count: devicesRevoked } = await client.twoFactorTrustedDevice.updateMany({
        where: { employeeCredentialsId: credentialsId, revokedTs: null },
        data: {
          revokedTs: now,
          revokedReason: TWO_FACTOR.REVOKED_BY_ADMIN_RESET,
          lastUpdateTs: toDbTime(now),
        },
      });
      await client.employeeCredentials.update({
        where: { employeeCredentialsId: credentialsId },
        data: {
          twoFactorEmail: null,
          twoFactorEmailVerifiedS: FLAG_NO,
          twoFactorEnabledS: FLAG_NO,
        },
      });
      await client.twoFactorChallenge.updateMany({
        where: {
          employeeCredentialsId: credentialsId,
          purpose: TWO_FACTOR.PURPOSE_LOGIN,
          consumedTs: null,
        },
        data: { consumedTs: now, lastUpdateTs: toDbTime(now) },
      });
      await client.twoFactorResetAudit.create({
        data: {
          employeeCredentialsId: credentialsId,
          resetByEmployeeId: resetBy,
          reason,
          previousEmail: account?.twoFactorEmail ?? null,
          devicesRevoked,
          creationTs: toDbTime(now),
          lastUpdateTs: toDbTime(now),
        },
      });
      return { devicesRevoked };
    },

    /**
     * @returns {Promise<{ roleId: number, name: string }[]>}
     */
    async listRoles() {
      const rows = await prisma.pharmacyRoles.findMany({
        select: { roleId: true, roleNm: true },
        orderBy: { roleNm: 'asc' },
      });
      return rows
        .filter((row) => row.roleNm?.trim())
        .map((row) => ({ roleId: row.roleId, name: /** @type {string} */ (row.roleNm).trim() }));
    },

    /**
     * @param {number} roleId
     * @returns {Promise<boolean>}
     */
    async roleExists(roleId) {
      return (await prisma.pharmacyRoles.count({ where: { roleId } })) > 0;
    },

    /**
     * Gives the employee one role at a branch: the first assignment is changed, any others removed
     * (an employee could hold several, which made their access hard to follow).
     *
     * @param {{ employeeId: number, roleId: number, branchId: number, by: string }} assignment
     * @param {Client} client A transaction client.
     * @returns {Promise<void>}
     */
    async setRole({ employeeId, roleId, branchId, by }, client) {
      const now = new Date();
      const existing = await client.employeePharmacyRole.findMany({
        where: { employeeId },
        select: { employeePharmacyRoleId: true },
        orderBy: { employeePharmacyRoleId: 'asc' },
      });
      const [first, ...others] = existing;
      if (first) {
        await client.employeePharmacyRole.update({
          where: { employeePharmacyRoleId: first.employeePharmacyRoleId },
          data: {
            roleId,
            pharmacyBranchId: branchId,
            lastUpdateUserId: by,
            lastUpdateTs: toDbTime(now),
          },
        });
      } else {
        await client.employeePharmacyRole.create({
          data: {
            employeeId,
            roleId,
            pharmacyBranchId: branchId,
            creationUserId: by,
            creationTs: toDbTime(now),
            lastUpdateUserId: by,
            lastUpdateTs: toDbTime(now),
          },
        });
      }
      if (others.length) {
        await client.employeePharmacyRole.deleteMany({
          where: {
            employeePharmacyRoleId: { in: others.map((row) => row.employeePharmacyRoleId) },
          },
        });
      }
    },

    /**
     * The permissions granted to the employee one by one (not through their role).
     *
     * @param {number} employeeId
     * @returns {Promise<number[]>}
     */
    async findDirectPermissionIds(employeeId) {
      const rows = await prisma.employeeAccess.findMany({
        where: { employeeId, activeS: FLAG_YES },
        select: { pharmaAccessId: true },
        distinct: ['pharmaAccessId'],
      });
      return rows.map((row) => row.pharmaAccessId).sort((a, b) => a - b);
    },

    /**
     * The permissions the employee has through their role(s).
     *
     * @param {number} employeeId
     * @returns {Promise<number[]>}
     */
    async findRolePermissionIds(employeeId) {
      /** @type {{ id: number }[]} */
      const rows = await prisma.$queryRaw`
        SELECT DISTINCT rp.PHARMA_ACCESS_ID AS id
        FROM employee_pharmacy_role epr
        JOIN ih_role_permission rp ON rp.ROLE_ID = epr.ROLE_ID
        WHERE epr.EMPLOYEE_ID = ${employeeId}
        ORDER BY id`;
      return rows.map((row) => Number(row.id));
    },

    /**
     * Sets the individual grants to exactly `permissionIds`: existing rows are switched on or off
     * (ACTIVE_S, so the history stays), missing ones are added.
     *
     * @param {{ employeeId: number, permissionIds: number[], by: string }} grants
     * @param {Client} client A transaction client.
     * @returns {Promise<{ granted: number[], revoked: number[] }>}
     */
    async setDirectPermissions({ employeeId, permissionIds, by }, client) {
      const now = new Date();
      const wanted = new Set(permissionIds);
      const rows = await client.employeeAccess.findMany({
        where: { employeeId },
        select: { employeeAccessId: true, pharmaAccessId: true, activeS: true },
      });
      const before = new Set(
        rows.filter((row) => row.activeS === FLAG_YES).map((row) => row.pharmaAccessId),
      );
      const onIds = rows.filter(
        (row) => wanted.has(row.pharmaAccessId) && row.activeS !== FLAG_YES,
      );
      const offIds = rows.filter(
        (row) => !wanted.has(row.pharmaAccessId) && row.activeS === FLAG_YES,
      );
      const stamp = { lastUpdateUserId: by, lastUpdateTs: toDbTime(now) };
      if (onIds.length)
        await client.employeeAccess.updateMany({
          where: { employeeAccessId: { in: onIds.map((row) => row.employeeAccessId) } },
          data: { activeS: FLAG_YES, ...stamp },
        });
      if (offIds.length)
        await client.employeeAccess.updateMany({
          where: { employeeAccessId: { in: offIds.map((row) => row.employeeAccessId) } },
          data: { activeS: FLAG_NO, ...stamp },
        });
      const known = new Set(rows.map((row) => row.pharmaAccessId));
      const missing = [...wanted].filter((id) => !known.has(id));
      if (missing.length)
        await client.employeeAccess.createMany({
          data: missing.map((pharmaAccessId) => ({
            employeeId,
            pharmaAccessId,
            activeS: FLAG_YES,
            creationUserId: by,
            creationTs: toDbTime(now),
            ...stamp,
          })),
        });
      return {
        granted: [...wanted].filter((id) => !before.has(id)).sort((a, b) => a - b),
        revoked: [...before].filter((id) => !wanted.has(id)).sort((a, b) => a - b),
      };
    },

    /**
     * @template T
     * @param {(tx: Client) => Promise<T>} work
     * @returns {Promise<T>}
     */
    transaction(work) {
      return prisma.$transaction(work);
    },
  };
}

/** @typedef {ReturnType<typeof createAccountAdminRepository>} AccountAdminRepository */
