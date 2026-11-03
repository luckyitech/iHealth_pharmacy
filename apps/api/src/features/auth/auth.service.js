import { randomUUID } from 'node:crypto';

import { ERROR_CODES } from '@ihealth/shared/errors';

import { AppError } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { AUDIT_ACTIONS, REFRESH_TOKEN_TTL_MS, REVOKE_REASONS } from './auth.constants.js';
import {
  hashPassword,
  legacyFingerprint,
  verifyAgainstDummy,
  verifyLegacySecret,
  verifyPassword,
} from './password-hasher.js';
import { generateRefreshToken, hashToken } from './tokens.js';

/**
 * @typedef {object} ClientInfo
 * @property {string} [ipAddress]
 * @property {string} [userAgent]
 */

/**
 * @typedef {object} IssuedSession
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {string} familyId
 * @property {number} employeeId
 * @property {number} credentialsId
 */

/**
 * @typedef {object} AuthServiceDeps
 * @property {import('./auth.repository.js').AuthRepository} repository
 * @property {ReturnType<typeof import('./tokens.js').createAccessTokens>} accessTokens
 * @property {import('./login-throttle.js').LoginThrottle} loginThrottle
 * @property {import('./login-throttle.js').LoginThrottle} pinThrottle
 * @property {import('../audit/audit-log.js').AuditLog} audit
 * @property {import('pino').Logger} logger
 * @property {() => Date} [now]
 */

/**
 * @param {number} seconds
 * @returns {AppError}
 */
const lockedError = (seconds) =>
  new AppError(ERROR_CODES.ACCOUNT_LOCKED, { headers: { 'Retry-After': String(seconds) } });

/**
 * @param {AuthServiceDeps} deps
 * @returns The auth service.
 */
export function createAuthService({
  repository,
  accessTokens,
  loginThrottle,
  pinThrottle,
  audit,
  logger,
  now = () => new Date(),
}) {
  /**
   * Checks the password against the upgraded argon2id hash when it is still current, otherwise
   * against the legacy value, which is then upgraded. The legacy column is never written.
   *
   * @param {import('./auth.repository.js').CredentialsRecord} credentials
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async function checkPassword(credentials, password) {
    const fingerprint = legacyFingerprint(credentials.legacyPassword);
    const upgraded = await repository.findUpgradedPassword(credentials.credentialsId);
    if (upgraded && upgraded.legacyFingerprint === fingerprint) {
      return verifyPassword(upgraded.hash, password);
    }
    // No upgrade yet, or the legacy system changed the password since: the legacy value is the truth.
    const valid = await verifyLegacySecret(credentials.legacyPassword, password);
    if (valid) {
      try {
        await repository.saveUpgradedPassword(
          credentials.credentialsId,
          await hashPassword(password),
          fingerprint,
        );
        await audit.record({
          action: AUDIT_ACTIONS.PASSWORD_UPGRADED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          employeeId: credentials.employeeId,
          resourceType: 'employee_credentials',
          resourceId: credentials.credentialsId,
        });
      } catch (error) {
        // An upgrade failure must not block a valid sign-in; the next sign-in retries it.
        logger.error({ err: error }, 'Password hash upgrade failed');
      }
    }
    return valid;
  }

  /**
   * @param {number} employeeId
   * @param {number} credentialsId
   * @param {string} familyId
   * @param {ClientInfo} client
   * @param {Parameters<import('./auth.repository.js').AuthRepository['insertRefreshToken']>[1]} [tx]
   * @returns {Promise<IssuedSession & { refreshTokenId: bigint }>}
   */
  async function issueSession(employeeId, credentialsId, familyId, client, tx) {
    const refreshToken = generateRefreshToken();
    const refreshTokenId = await repository.insertRefreshToken(
      {
        familyId,
        employeeId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(now().getTime() + REFRESH_TOKEN_TTL_MS),
        ...client,
      },
      tx,
    );
    const accessToken = await accessTokens.sign({ employeeId, credentialsId, familyId });
    return { accessToken, refreshToken, familyId, employeeId, credentialsId, refreshTokenId };
  }

  return {
    /**
     * @param {{ username: string, password: string }} input
     * @param {ClientInfo} client
     * @returns {Promise<IssuedSession>}
     */
    async login({ username, password }, client) {
      const lockedFor = await loginThrottle.lockedFor(username);
      if (lockedFor !== null) {
        await audit.record({
          action: AUDIT_ACTIONS.LOGIN,
          outcome: AUDIT_OUTCOMES.DENIED,
          employeeId: null,
          details: { username, reason: 'locked' },
          ...client,
        });
        throw lockedError(lockedFor);
      }

      const credentials = await repository.findCredentialsByUsername(username);
      const valid = credentials
        ? await checkPassword(credentials, password)
        : (await verifyAgainstDummy(password), false);

      if (!credentials || !valid) {
        const failures = await loginThrottle.recordFailure(username);
        await audit.record({
          action: AUDIT_ACTIONS.LOGIN,
          outcome: AUDIT_OUTCOMES.FAILURE,
          employeeId: credentials?.employeeId ?? null,
          details: { username, failures },
          ...client,
        });
        const nowLocked = await loginThrottle.lockedFor(username);
        if (nowLocked !== null) throw lockedError(nowLocked);
        throw new AppError(ERROR_CODES.INVALID_CREDENTIALS);
      }

      // Account state is only revealed after a correct password, so it cannot be used to probe usernames.
      const employee = await repository.findEmployee(credentials.employeeId);
      if (!credentials.active || !employee?.active) {
        await audit.record({
          action: AUDIT_ACTIONS.LOGIN,
          outcome: AUDIT_OUTCOMES.DENIED,
          employeeId: credentials.employeeId,
          details: { reason: 'inactive' },
          ...client,
        });
        throw new AppError(ERROR_CODES.ACCOUNT_INACTIVE);
      }
      if (credentials.twoFactorEnabled) {
        await audit.record({
          action: AUDIT_ACTIONS.LOGIN,
          outcome: AUDIT_OUTCOMES.DENIED,
          employeeId: credentials.employeeId,
          details: { reason: 'two_factor_required' },
          ...client,
        });
        throw new AppError(ERROR_CODES.TWO_FACTOR_REQUIRED);
      }

      await loginThrottle.reset(username);
      const session = await issueSession(
        credentials.employeeId,
        credentials.credentialsId,
        randomUUID(),
        client,
      );
      await audit.record({
        action: AUDIT_ACTIONS.LOGIN,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        employeeId: credentials.employeeId,
        details: { familyId: session.familyId },
        ...client,
      });
      return session;
    },

    /**
     * Rotates a refresh token. Presenting a token that was already rotated means it was copied:
     * the whole sign-in (token family) is revoked.
     *
     * @param {string | undefined} refreshToken
     * @param {ClientInfo} client
     * @returns {Promise<IssuedSession>}
     */
    async refresh(refreshToken, client) {
      if (!refreshToken) throw new AppError(ERROR_CODES.SESSION_EXPIRED);
      const tokenHash = hashToken(refreshToken);

      const outcome = await repository.transaction(async (tx) => {
        const stored = await repository.findRefreshToken(tokenHash, tx);
        if (!stored) return { status: 'unknown' };
        if (stored.revokedAt) return { status: 'reused', stored };
        if (stored.expiresAt.getTime() <= now().getTime()) return { status: 'expired' };

        const credentials = await repository.findCredentialsByEmployee(stored.employeeId);
        if (!credentials?.active) return { status: 'inactive' };

        const session = await issueSession(
          stored.employeeId,
          credentials.credentialsId,
          stored.familyId,
          client,
          tx,
        );
        await repository.revokeRefreshToken(
          stored.id,
          REVOKE_REASONS.ROTATED,
          session.refreshTokenId,
          tx,
        );
        return { status: 'rotated', session };
      });

      if (outcome.status === 'rotated' && outcome.session) return outcome.session;
      if (outcome.status === 'reused' && outcome.stored) {
        await repository.revokeFamily(outcome.stored.familyId, REVOKE_REASONS.REUSE_DETECTED);
        await audit.record({
          action: AUDIT_ACTIONS.REFRESH_REUSE,
          outcome: AUDIT_OUTCOMES.DENIED,
          employeeId: outcome.stored.employeeId,
          details: { familyId: outcome.stored.familyId },
          ...client,
        });
      }
      throw new AppError(ERROR_CODES.SESSION_EXPIRED);
    },

    /**
     * @param {{ employeeId: number, familyId: string }} auth
     * @param {ClientInfo} client
     * @returns {Promise<void>}
     */
    async logout({ employeeId, familyId }, client) {
      await repository.revokeFamily(familyId, REVOKE_REASONS.LOGOUT);
      await audit.record({
        action: AUDIT_ACTIONS.LOGOUT,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        employeeId,
        details: { familyId },
        ...client,
      });
    },

    /**
     * @param {number} employeeId
     * @param {number} credentialsId
     * @returns The approver.
     */
    async currentUser(employeeId, credentialsId) {
      const [employee, credentials, roles, permissionIds] = await Promise.all([
        repository.findEmployee(employeeId),
        repository.findCredentialsById(credentialsId),
        repository.findRoles(employeeId),
        repository.findEffectivePermissionIds(employeeId),
      ]);
      if (!employee || !credentials) throw new AppError(ERROR_CODES.UNAUTHENTICATED);
      return {
        employeeId: employee.employeeId,
        username: credentials.username,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        pharmacyId: employee.pharmacyId,
        roles,
        permissionIds,
      };
    },

    /**
     * Checks an approver's PIN (supervisor approval), exactly as the legacy verifyApprovalPin does:
     * against BCrypt or plain text. The stored PIN is never rewritten, because legacy screens compare
     * it in the browser.
     *
     * @param {{ username: string, pin: string, action?: string }} input
     * @param {ClientInfo} client
     * @returns {Promise<{ approverEmployeeId: number, approverName: string }>}
     */
    async verifyApprovalPin({ username, pin, action }, client) {
      const lockedFor = await pinThrottle.lockedFor(username);
      if (lockedFor !== null) throw lockedError(lockedFor);

      const credentials = await repository.findCredentialsByUsername(username);
      const employee = credentials ? await repository.findEmployee(credentials.employeeId) : null;
      const valid =
        Boolean(credentials?.active && employee?.active) &&
        (await verifyLegacySecret(credentials?.approvalPin, pin));

      await audit.record({
        action: AUDIT_ACTIONS.APPROVAL_PIN,
        outcome: valid ? AUDIT_OUTCOMES.SUCCESS : AUDIT_OUTCOMES.FAILURE,
        details: {
          approver: username,
          approverEmployeeId: credentials?.employeeId ?? null,
          approvalFor: action,
        },
        ...client,
      });

      if (!valid || !credentials || !employee) {
        await pinThrottle.recordFailure(username);
        throw new AppError(ERROR_CODES.APPROVAL_PIN_INVALID);
      }
      await pinThrottle.reset(username);
      return {
        approverEmployeeId: employee.employeeId,
        approverName: `${employee.firstName} ${employee.lastName}`,
      };
    },
  };
}

/** @typedef {ReturnType<typeof createAuthService>} AuthService */
