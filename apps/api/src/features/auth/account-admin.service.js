import { randomBytes } from 'node:crypto';

import { ERROR_CODES } from '@ihealth/shared/errors';

import { AppError, notFound } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { accountThrottleKey, REVOKE_REASONS } from './auth.constants.js';
import { assertNotPersonal } from './auth.service.js';
import { hashPassword, legacyFingerprint } from './password-hasher.js';

/** Bytes of the random value put in the legacy password column of a sign-in created here. */
const LEGACY_PLACEHOLDER_BYTES = 32;

/** Audit actions of account administration. */
export const ACCOUNT_AUDIT_ACTIONS = Object.freeze({
  LOGIN_CREATED: 'employees.access.login_created',
  USERNAME_CHANGED: 'employees.access.username_changed',
  PASSWORD_SET: 'employees.access.password_set',
  LOGIN_ENABLED: 'employees.access.login_enabled',
  LOGIN_DISABLED: 'employees.access.login_disabled',
  UNLOCKED: 'employees.access.unlocked',
  TWO_FACTOR_RESET: 'employees.access.two_factor_reset',
  ROLE_SET: 'employees.access.role_set',
  PERMISSIONS_SET: 'employees.access.permissions_set',
});

/**
 * @typedef {object} Actor The administrator doing it.
 * @property {number} employeeId
 * @property {string} [ipAddress]
 */

/**
 * Administering staff accounts: create or rename a sign-in, set a password (optionally to be
 * changed at the next sign-in), turn sign-in on or off, lift a lockout, reset two-factor sign-in,
 * set the role and the individual permissions. Every change is audited.
 *
 * Administrators cannot change their own sign-in, role or permissions here, so nobody can lock
 * themselves out or grant themselves more access.
 *
 * @param {object} deps
 * @param {import('./auth.repository.js').AuthRepository} deps.repository
 * @param {import('./account-admin.repository.js').AccountAdminRepository} deps.adminRepository
 * @param {import('./login-throttle.js').LoginThrottle} deps.loginThrottle
 * @param {import('../audit/audit-log.js').AuditLog} deps.audit
 * @param {() => Date} [deps.now]
 * @returns The service.
 */
export function createAccountAdminService({
  repository,
  adminRepository,
  loginThrottle,
  audit,
  now = () => new Date(),
}) {
  /**
   * @param {Actor} actor
   * @param {number} employeeId
   * @returns {void}
   */
  function assertNotSelf(actor, employeeId) {
    if (actor.employeeId === employeeId) {
      throw new AppError(ERROR_CODES.FORBIDDEN, {
        message: 'You cannot change your own sign-in or access here. Ask another administrator.',
      });
    }
  }

  /**
   * @param {number} employeeId
   * @returns {Promise<NonNullable<Awaited<ReturnType<typeof repository.findEmployee>>>>}
   */
  async function employeeOrFail(employeeId) {
    const employee = await repository.findEmployee(employeeId);
    if (!employee) throw notFound('Employee not found');
    return employee;
  }

  /**
   * @param {number} employeeId
   * @returns {Promise<import('./auth.repository.js').CredentialsRecord>}
   */
  async function credentialsOrFail(employeeId) {
    const credentials = await repository.findCredentialsByEmployee(employeeId);
    if (!credentials) {
      throw new AppError(ERROR_CODES.CONFLICT, {
        message: 'This employee has no sign-in yet. Create one first.',
      });
    }
    return credentials;
  }

  /**
   * @param {string} username
   * @param {number | null} credentialsId The account it may already belong to.
   * @returns {Promise<void>}
   */
  async function assertUsernameFree(username, credentialsId) {
    const owner = await repository.findCredentialsByUsername(username);
    if (owner && owner.credentialsId !== credentialsId) {
      const message = 'This username is already taken';
      throw new AppError(ERROR_CODES.CONFLICT, {
        message,
        details: [{ path: 'body.username', message }],
      });
    }
  }

  /**
   * @param {Actor} actor
   * @param {string} action
   * @param {number} employeeId
   * @param {Record<string, unknown>} [details]
   * @returns {Promise<void>}
   */
  const record = (actor, action, employeeId, details) =>
    audit.record({
      action,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      employeeId: actor.employeeId,
      resourceType: 'employee',
      resourceId: employeeId,
      ipAddress: actor.ipAddress,
      details,
    });

  return {
    /**
     * @param {number} employeeId
     * @returns {Promise<import('zod').infer<typeof import('@ihealth/shared/schemas').employeeAccessSchema>>}
     */
    async getAccess(employeeId) {
      await employeeOrFail(employeeId);
      const [credentials, roles, permissionIds, rolePermissionIds] = await Promise.all([
        repository.findCredentialsByEmployee(employeeId),
        repository.findRoles(employeeId),
        adminRepository.findDirectPermissionIds(employeeId),
        adminRepository.findRolePermissionIds(employeeId),
      ]);
      const lockedFor = credentials
        ? await loginThrottle.lockedFor(accountThrottleKey(credentials.credentialsId))
        : null;
      return {
        employeeId,
        hasLogin: Boolean(credentials),
        username: credentials?.username ?? null,
        loginEnabled: credentials?.active ?? false,
        lockedUntil:
          lockedFor === null ? null : new Date(now().getTime() + lockedFor * 1000).toISOString(),
        twoFactorEnabled: credentials?.twoFactorEnabled ?? false,
        mustChangePassword: credentials
          ? await repository.isPasswordChangeRequired(credentials.credentialsId)
          : false,
        roleId: roles[0]?.roleId ?? null,
        roleName: roles[0]?.name ?? null,
        permissionIds,
        rolePermissionIds,
      };
    },

    /**
     * Creates the employee's sign-in (a first password is then required) or renames it.
     *
     * @param {{ employeeId: number, username: string, password?: string, mustChangePassword: boolean }} input
     * @param {Actor} actor
     * @returns {Promise<void>}
     */
    async saveLogin({ employeeId, username, password, mustChangePassword }, actor) {
      const employee = await employeeOrFail(employeeId);
      const existing = await repository.findCredentialsByEmployee(employeeId);
      await assertUsernameFree(username, existing?.credentialsId ?? null);
      const by = String(actor.employeeId);

      if (existing) {
        if (existing.username === username) return;
        assertNotSelf(actor, employeeId);
        await adminRepository.updateCredentials(existing.credentialsId, { username }, by);
        await record(actor, ACCOUNT_AUDIT_ACTIONS.USERNAME_CHANGED, employeeId, {
          from: existing.username,
          to: username,
        });
        return;
      }

      if (!password) {
        const message = 'Set a first password for the new sign-in';
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
          message,
          details: [{ path: 'body.password', message }],
        });
      }
      assertNotPersonal(password, { username }, employee, 'body.password', 'their');
      // The legacy column must hold something; a random value no one knows keeps the legacy app
      // from accepting any password for this account. The real one lives in ih_employee_password.
      const legacyPassword = randomBytes(LEGACY_PLACEHOLDER_BYTES).toString('hex');
      const hash = await hashPassword(password);
      await adminRepository.transaction(async (tx) => {
        const credentialsId = await adminRepository.createCredentials(
          { employeeId, username, legacyPassword, by },
          tx,
        );
        await repository.saveUpgradedPassword(
          credentialsId,
          hash,
          legacyFingerprint(legacyPassword),
          tx,
        );
        if (mustChangePassword)
          await repository.setPasswordChangeRequired(credentialsId, true, by, tx);
      });
      await record(actor, ACCOUNT_AUDIT_ACTIONS.LOGIN_CREATED, employeeId, {
        username,
        mustChangePassword,
      });
    },

    /**
     * Sets a new password chosen by the administrator; all the employee's sessions end.
     *
     * @param {{ employeeId: number, password: string, mustChangePassword: boolean }} input
     * @param {Actor} actor
     * @returns {Promise<void>}
     */
    async setPassword({ employeeId, password, mustChangePassword }, actor) {
      assertNotSelf(actor, employeeId);
      const employee = await employeeOrFail(employeeId);
      const credentials = await credentialsOrFail(employeeId);
      assertNotPersonal(password, credentials, employee, 'body.password', 'their');
      const hash = await hashPassword(password);
      await repository.transaction(async (tx) => {
        await repository.saveUpgradedPassword(
          credentials.credentialsId,
          hash,
          legacyFingerprint(credentials.legacyPassword),
          tx,
        );
        await repository.setPasswordChangeRequired(
          credentials.credentialsId,
          mustChangePassword,
          String(actor.employeeId),
          tx,
        );
        await repository.revokeAllForEmployee(employeeId, REVOKE_REASONS.ADMIN_PASSWORD_SET, tx);
      });
      // A new password also lifts a lockout caused by the old one.
      await loginThrottle.reset(accountThrottleKey(credentials.credentialsId));
      await record(actor, ACCOUNT_AUDIT_ACTIONS.PASSWORD_SET, employeeId, { mustChangePassword });
    },

    /**
     * Turns the employee's sign-in on or off. Turning it off ends their sessions at once.
     *
     * @param {{ employeeId: number, enabled: boolean }} input
     * @param {Actor} actor
     * @returns {Promise<void>}
     */
    async setLoginEnabled({ employeeId, enabled }, actor) {
      assertNotSelf(actor, employeeId);
      const credentials = await credentialsOrFail(employeeId);
      if (credentials.active === enabled) return;
      await adminRepository.updateCredentials(
        credentials.credentialsId,
        { active: enabled },
        String(actor.employeeId),
      );
      if (!enabled)
        await repository.revokeAllForEmployee(employeeId, REVOKE_REASONS.LOGIN_DISABLED);
      await record(
        actor,
        enabled ? ACCOUNT_AUDIT_ACTIONS.LOGIN_ENABLED : ACCOUNT_AUDIT_ACTIONS.LOGIN_DISABLED,
        employeeId,
      );
    },

    /**
     * Lifts a lockout after too many wrong passwords.
     *
     * @param {number} employeeId
     * @param {Actor} actor
     * @returns {Promise<void>}
     */
    async unlock(employeeId, actor) {
      const credentials = await credentialsOrFail(employeeId);
      await loginThrottle.reset(accountThrottleKey(credentials.credentialsId));
      await record(actor, ACCOUNT_AUDIT_ACTIONS.UNLOCKED, employeeId);
    },

    /**
     * @param {{ employeeId: number, reason: string }} input
     * @param {Actor} actor
     * @returns {Promise<{ devicesRevoked: number }>}
     */
    async resetTwoFactor({ employeeId, reason }, actor) {
      assertNotSelf(actor, employeeId);
      const credentials = await credentialsOrFail(employeeId);
      const result = await adminRepository.transaction((tx) =>
        adminRepository.resetTwoFactor(
          { credentialsId: credentials.credentialsId, resetBy: actor.employeeId, reason },
          tx,
        ),
      );
      await record(actor, ACCOUNT_AUDIT_ACTIONS.TWO_FACTOR_RESET, employeeId, {
        reason,
        devicesRevoked: result.devicesRevoked,
      });
      return result;
    },

    /**
     * @param {{ employeeId: number, roleId: number, branchId: number }} input
     * @param {Actor} actor
     * @returns {Promise<void>}
     */
    async setRole({ employeeId, roleId, branchId }, actor) {
      assertNotSelf(actor, employeeId);
      await employeeOrFail(employeeId);
      if (!(await adminRepository.roleExists(roleId))) {
        const message = 'Choose one of the listed roles';
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
          message,
          details: [{ path: 'body.roleId', message }],
        });
      }
      const before = await repository.findRoles(employeeId);
      await adminRepository.transaction((tx) =>
        adminRepository.setRole({ employeeId, roleId, branchId, by: String(actor.employeeId) }, tx),
      );
      await record(actor, ACCOUNT_AUDIT_ACTIONS.ROLE_SET, employeeId, {
        from: before.map((role) => role.roleId),
        to: roleId,
      });
    },

    /**
     * Sets the employee's individual permissions to exactly the given list.
     *
     * @param {{ employeeId: number, permissionIds: number[] }} input
     * @param {Actor} actor
     * @returns {Promise<void>}
     */
    async setPermissions({ employeeId, permissionIds }, actor) {
      assertNotSelf(actor, employeeId);
      await employeeOrFail(employeeId);
      const changes = await adminRepository.transaction((tx) =>
        adminRepository.setDirectPermissions(
          { employeeId, permissionIds, by: String(actor.employeeId) },
          tx,
        ),
      );
      if (changes.granted.length || changes.revoked.length)
        await record(actor, ACCOUNT_AUDIT_ACTIONS.PERMISSIONS_SET, employeeId, changes);
    },

    /** @returns {Promise<{ id: number, name: string }[]>} */
    async listRoles() {
      const roles = await adminRepository.listRoles();
      return roles.map((role) => ({ id: role.roleId, name: role.name }));
    },
  };
}

/** @typedef {ReturnType<typeof createAccountAdminService>} AccountAdminService */
