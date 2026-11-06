/**
 * Data access for authentication. Legacy tables go through the Prisma models. The additive `ih_*`
 * tables are not part of the introspected schema, so they use parameterised raw queries
 * (Prisma tagged templates; values are always bound, never interpolated).
 */

/** @typedef {import('#db').PrismaClient} PrismaClient */

/**
 * @typedef {object} CredentialsRecord
 * @property {number} credentialsId
 * @property {number} employeeId
 * @property {string} username
 * @property {string} legacyPassword
 * @property {string | null} approvalPin
 * @property {boolean} active
 * @property {boolean} twoFactorEnabled
 */

/**
 * @typedef {object} EmployeeRecord
 * @property {number} employeeId
 * @property {string} firstName
 * @property {string} lastName
 * @property {string | null} email
 * @property {number | null} pharmacyId
 * @property {boolean} active
 */

/**
 * @typedef {object} RefreshTokenRecord
 * @property {bigint} id
 * @property {string} familyId
 * @property {number} employeeId
 * @property {Date} expiresAt
 * @property {Date | null} revokedAt
 * @property {string | null} revokedReason
 * @property {number | null} revokedSecondsAgo By the database clock, which also stamped the revocation.
 */

/**
 * @param {PrismaClient} prisma
 * @returns The repository.
 */
export function createAuthRepository(prisma) {
  /**
   * @param {{ employeeCredentialsId: number, employeeId: number, userNm: string, currentPassword: string, approvalAccessPin: string | null, activeS: string | null, twoFactorEnabledS: string | null }} row
   * @returns {CredentialsRecord}
   */
  const toCredentials = (row) => ({
    credentialsId: row.employeeCredentialsId,
    employeeId: row.employeeId,
    username: row.userNm,
    legacyPassword: row.currentPassword,
    approvalPin: row.approvalAccessPin,
    active: row.activeS === 'Y',
    twoFactorEnabled: row.twoFactorEnabledS === 'Y',
  });

  const credentialsSelect = {
    employeeCredentialsId: true,
    employeeId: true,
    userNm: true,
    currentPassword: true,
    approvalAccessPin: true,
    activeS: true,
    twoFactorEnabledS: true,
  };

  return {
    /**
     * @param {string} username
     * @returns {Promise<CredentialsRecord | null>}
     */
    async findCredentialsByUsername(username) {
      const row = await prisma.employeeCredentials.findUnique({
        where: { userNm: username },
        select: credentialsSelect,
      });
      return row ? toCredentials(row) : null;
    },

    /**
     * Credentials of every account whose employee has this work email (`employee.EMAIL_ID`),
     * ignoring case and surrounding spaces. More than one result means the email is shared.
     *
     * @param {string} email
     * @returns {Promise<CredentialsRecord[]>}
     */
    async findCredentialsByEmail(email) {
      /** @type {{ employeeCredentialsId: number, employeeId: number, userNm: string, currentPassword: string, approvalAccessPin: string | null, activeS: string | null, twoFactorEnabledS: string | null }[]} */
      const rows = await prisma.$queryRaw`
        SELECT c.EMPLOYEE_CREDENTIALS_ID AS employeeCredentialsId, c.EMPLOYEE_ID AS employeeId,
               c.USER_NM AS userNm, c.CURRENT_PASSWORD AS currentPassword,
               c.APPROVAL_ACCESS_PIN AS approvalAccessPin, c.ACTIVE_S AS activeS,
               c.TWO_FACTOR_ENABLED_S AS twoFactorEnabledS
        FROM employee_credentials c
        JOIN employee e ON e.EMPLOYEE_ID = c.EMPLOYEE_ID
        WHERE LOWER(TRIM(e.EMAIL_ID)) = ${email.trim().toLowerCase()}
        ORDER BY c.EMPLOYEE_CREDENTIALS_ID`;
      return rows.map(toCredentials);
    },

    /**
     * @param {number} credentialsId
     * @returns {Promise<CredentialsRecord | null>}
     */
    async findCredentialsById(credentialsId) {
      const row = await prisma.employeeCredentials.findUnique({
        where: { employeeCredentialsId: credentialsId },
        select: credentialsSelect,
      });
      return row ? toCredentials(row) : null;
    },

    /**
     * @param {number} employeeId
     * @returns {Promise<CredentialsRecord | null>}
     */
    async findCredentialsByEmployee(employeeId) {
      const row = await prisma.employeeCredentials.findFirst({
        where: { employeeId },
        select: credentialsSelect,
        orderBy: { employeeCredentialsId: 'asc' },
      });
      return row ? toCredentials(row) : null;
    },

    /**
     * @param {number} employeeId
     * @returns {Promise<EmployeeRecord | null>}
     */
    async findEmployee(employeeId) {
      const row = await prisma.employee.findUnique({
        where: { employeeId },
        select: {
          employeeId: true,
          firstNm: true,
          lastNm: true,
          emailId: true,
          pharmacyId: true,
          activeS: true,
        },
      });
      if (!row) return null;
      return {
        employeeId: row.employeeId,
        firstName: row.firstNm,
        lastName: row.lastNm,
        email: row.emailId,
        pharmacyId: row.pharmacyId,
        active: row.activeS === 'Y',
      };
    },

    /**
     * @param {number} employeeId
     * @returns {Promise<{ roleId: number, name: string | null, pharmacyBranchId: number }[]>}
     */
    async findRoles(employeeId) {
      const assignments = await prisma.employeePharmacyRole.findMany({
        where: { employeeId },
        select: { roleId: true, pharmacyBranchId: true },
        orderBy: { roleId: 'asc' },
      });
      const roles = await prisma.pharmacyRoles.findMany({
        where: { roleId: { in: assignments.map((assignment) => assignment.roleId) } },
        select: { roleId: true, roleNm: true },
      });
      const names = new Map(roles.map((role) => [role.roleId, role.roleNm]));
      return assignments.map((assignment) => ({
        roleId: assignment.roleId,
        name: names.get(assignment.roleId) ?? null,
        pharmacyBranchId: assignment.pharmacyBranchId,
      }));
    },

    /**
     * Effective permissions: those of the employee's roles, plus their active individual grants.
     * Permissions deactivated in pharma_access are excluded.
     *
     * @param {number} employeeId
     * @returns {Promise<number[]>}
     */
    async findEffectivePermissionIds(employeeId) {
      /** @type {{ id: number }[]} */
      const rows = await prisma.$queryRaw`
        SELECT DISTINCT granted.id AS id
        FROM (
          SELECT rp.PHARMA_ACCESS_ID AS id
          FROM employee_pharmacy_role epr
          JOIN ih_role_permission rp ON rp.ROLE_ID = epr.ROLE_ID
          WHERE epr.EMPLOYEE_ID = ${employeeId}
          UNION
          SELECT ea.PHARMA_ACCESS_ID AS id
          FROM employee_access ea
          WHERE ea.EMPLOYEE_ID = ${employeeId} AND ea.ACTIVE_S = 'Y'
        ) granted
        JOIN pharma_access pa ON pa.PHARMA_ACCESS_ID = granted.id AND COALESCE(pa.ACTIVE_S, 'Y') = 'Y'
        ORDER BY id`;
      return rows.map((row) => Number(row.id));
    },

    /**
     * @param {number} credentialsId
     * @returns {Promise<{ hash: string, legacyFingerprint: string } | null>}
     */
    async findUpgradedPassword(credentialsId) {
      /** @type {{ hash: string, legacyFingerprint: string }[]} */
      const rows = await prisma.$queryRaw`
        SELECT PASSWORD_HASH AS hash, LEGACY_FINGERPRINT AS legacyFingerprint
        FROM ih_employee_password WHERE EMPLOYEE_CREDENTIALS_ID = ${credentialsId}`;
      return rows[0] ?? null;
    },

    /**
     * @param {number} credentialsId
     * @param {string} hash
     * @param {string} fingerprint
     * @param {Pick<PrismaClient, '$executeRaw'>} [client] A transaction client.
     * @returns {Promise<void>}
     */
    async saveUpgradedPassword(credentialsId, hash, fingerprint, client = prisma) {
      await client.$executeRaw`
        INSERT INTO ih_employee_password (EMPLOYEE_CREDENTIALS_ID, PASSWORD_HASH, LEGACY_FINGERPRINT)
        VALUES (${credentialsId}, ${hash}, ${fingerprint})
        ON DUPLICATE KEY UPDATE PASSWORD_HASH = VALUES(PASSWORD_HASH), LEGACY_FINGERPRINT = VALUES(LEGACY_FINGERPRINT)`;
    },

    /**
     * @param {{ familyId: string, employeeId: number, tokenHash: string, expiresAt: Date, userAgent?: string, ipAddress?: string }} token
     * @param {Pick<PrismaClient, '$executeRaw' | '$queryRaw'>} [client] A transaction client.
     * @returns {Promise<bigint>} The new token's id.
     */
    async insertRefreshToken(token, client = prisma) {
      await client.$executeRaw`
        INSERT INTO ih_refresh_token (FAMILY_ID, EMPLOYEE_ID, TOKEN_HASH, EXPIRES_AT, USER_AGENT, IP_ADDRESS)
        VALUES (${token.familyId}, ${token.employeeId}, ${token.tokenHash}, ${token.expiresAt},
                ${token.userAgent?.slice(0, 255) ?? null}, ${token.ipAddress?.slice(0, 45) ?? null})`;
      /** @type {{ id: bigint }[]} */
      const rows = await client.$queryRaw`SELECT LAST_INSERT_ID() AS id`;
      return BigInt(rows[0].id);
    },

    /**
     * @param {string} tokenHash
     * @param {Pick<PrismaClient, '$queryRaw'>} [client]
     * @returns {Promise<RefreshTokenRecord | null>}
     */
    async findRefreshToken(tokenHash, client = prisma) {
      /** @type {RefreshTokenRecord[]} */
      const rows = await client.$queryRaw`
        SELECT REFRESH_TOKEN_ID AS id, FAMILY_ID AS familyId, EMPLOYEE_ID AS employeeId,
               EXPIRES_AT AS expiresAt, REVOKED_AT AS revokedAt, REVOKED_REASON AS revokedReason,
               TIMESTAMPDIFF(SECOND, REVOKED_AT, CURRENT_TIMESTAMP(3)) AS revokedSecondsAgo
        FROM ih_refresh_token WHERE TOKEN_HASH = ${tokenHash} FOR UPDATE`;
      return rows[0] ?? null;
    },

    /**
     * @param {bigint} id
     * @param {string} reason
     * @param {bigint | null} replacedById
     * @param {Pick<PrismaClient, '$executeRaw'>} [client]
     * @returns {Promise<void>}
     */
    async revokeRefreshToken(id, reason, replacedById, client = prisma) {
      await client.$executeRaw`
        UPDATE ih_refresh_token
        SET REVOKED_AT = CURRENT_TIMESTAMP(3), REVOKED_REASON = ${reason}, REPLACED_BY_ID = ${replacedById}
        WHERE REFRESH_TOKEN_ID = ${id} AND REVOKED_AT IS NULL`;
    },

    /**
     * @param {string} familyId
     * @param {string} reason
     * @returns {Promise<void>}
     */
    async revokeFamily(familyId, reason) {
      await prisma.$executeRaw`
        UPDATE ih_refresh_token SET REVOKED_AT = CURRENT_TIMESTAMP(3), REVOKED_REASON = ${reason}
        WHERE FAMILY_ID = ${familyId} AND REVOKED_AT IS NULL`;
    },

    /**
     * Revokes every sign-in of an employee (after a password reset).
     *
     * @param {number} employeeId
     * @param {string} reason
     * @param {Pick<PrismaClient, '$executeRaw'>} [client]
     * @returns {Promise<void>}
     */
    async revokeAllForEmployee(employeeId, reason, client = prisma) {
      await client.$executeRaw`
        UPDATE ih_refresh_token SET REVOKED_AT = CURRENT_TIMESTAMP(3), REVOKED_REASON = ${reason}
        WHERE EMPLOYEE_ID = ${employeeId} AND REVOKED_AT IS NULL`;
    },

    /**
     * @param {{ credentialsId: number, tokenHash: string, expiresAt: Date, requestIp?: string }} reset
     * @returns {Promise<void>}
     */
    async insertPasswordReset(reset) {
      await prisma.$executeRaw`
        INSERT INTO ih_password_reset (EMPLOYEE_CREDENTIALS_ID, TOKEN_HASH, EXPIRES_AT, REQUEST_IP)
        VALUES (${reset.credentialsId}, ${reset.tokenHash}, ${reset.expiresAt}, ${reset.requestIp?.slice(0, 45) ?? null})`;
    },

    /**
     * @param {string} tokenHash
     * @param {Pick<PrismaClient, '$queryRaw'>} [client]
     * @returns {Promise<{ id: bigint, credentialsId: number, expiresAt: Date, usedAt: Date | null } | null>}
     */
    async findPasswordReset(tokenHash, client = prisma) {
      /** @type {{ id: bigint, credentialsId: number, expiresAt: Date, usedAt: Date | null }[]} */
      const rows = await client.$queryRaw`
        SELECT PASSWORD_RESET_ID AS id, EMPLOYEE_CREDENTIALS_ID AS credentialsId,
               EXPIRES_AT AS expiresAt, USED_AT AS usedAt
        FROM ih_password_reset WHERE TOKEN_HASH = ${tokenHash} FOR UPDATE`;
      return rows[0] ?? null;
    },

    /**
     * Marks a reset as used and voids every other open reset of the same account.
     *
     * @param {number} credentialsId
     * @param {Pick<PrismaClient, '$executeRaw'>} [client]
     * @returns {Promise<void>}
     */
    async closePasswordResets(credentialsId, client = prisma) {
      await client.$executeRaw`
        UPDATE ih_password_reset SET USED_AT = CURRENT_TIMESTAMP(3)
        WHERE EMPLOYEE_CREDENTIALS_ID = ${credentialsId} AND USED_AT IS NULL`;
    },

    /**
     * Whether the account must choose a new password before doing anything else.
     *
     * @param {number} credentialsId
     * @returns {Promise<boolean>}
     */
    async isPasswordChangeRequired(credentialsId) {
      /** @type {{ required: bigint | number }[]} */
      const rows = await prisma.$queryRaw`
        SELECT COUNT(*) AS required FROM ih_password_change_required
        WHERE EMPLOYEE_CREDENTIALS_ID = ${credentialsId}`;
      return Number(rows[0]?.required ?? 0) > 0;
    },

    /**
     * @param {number} credentialsId
     * @param {boolean} required
     * @param {string | null} by Employee id of the administrator who asked for it (null when cleared).
     * @param {Pick<PrismaClient, '$executeRaw'>} [client]
     * @returns {Promise<void>}
     */
    async setPasswordChangeRequired(credentialsId, required, by, client = prisma) {
      if (required) {
        await client.$executeRaw`
          INSERT INTO ih_password_change_required (EMPLOYEE_CREDENTIALS_ID, REQUIRED_BY)
          VALUES (${credentialsId}, ${by})
          ON DUPLICATE KEY UPDATE REQUIRED_AT = CURRENT_TIMESTAMP(3), REQUIRED_BY = VALUES(REQUIRED_BY)`;
      } else {
        await client.$executeRaw`
          DELETE FROM ih_password_change_required WHERE EMPLOYEE_CREDENTIALS_ID = ${credentialsId}`;
      }
    },

    /**
     * @template T
     * @param {(tx: Pick<PrismaClient, '$executeRaw' | '$queryRaw'>) => Promise<T>} work
     * @returns {Promise<T>}
     */
    transaction(work) {
      return prisma.$transaction(work);
    },
  };
}

/** @typedef {ReturnType<typeof createAuthRepository>} AuthRepository */
