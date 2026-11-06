import { MS_PER_MINUTE } from '@ihealth/shared/units';
import { randomUUID } from 'node:crypto';

import { ERROR_CODES } from '@ihealth/shared/errors';
import { isEmailIdentifier } from '@ihealth/shared/schemas';

import { AppError } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import {
  accountThrottleKey,
  AUDIT_ACTIONS,
  PASSWORD_RESET_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  REFRESH_GRACE_SECONDS,
  REVOKE_REASONS,
} from './auth.constants.js';
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
 * @property {import('./login-throttle.js').LoginThrottle} resetThrottle Limits reset emails per account.
 * @property {import('../../infra/mailer.js').Mailer} mailer
 * @property {string} appUrl Public address of the web app, for links in emails.
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
  resetThrottle,
  mailer,
  appUrl,
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
   * Finds the account a sign-in identifier refers to: a username, or a work email that belongs to
   * exactly one active account. A shared email is reported, because guessing would sign the wrong
   * person in.
   *
   * @param {string} identifier
   * @returns {Promise<{ credentials: import('./auth.repository.js').CredentialsRecord | null, ambiguous: boolean }>}
   */
  async function resolveAccount(identifier) {
    if (!isEmailIdentifier(identifier)) {
      return {
        credentials: await repository.findCredentialsByUsername(identifier),
        ambiguous: false,
      };
    }
    const matches = await repository.findCredentialsByEmail(identifier);
    if (matches.length <= 1) return { credentials: matches[0] ?? null, ambiguous: false };
    const active = matches.filter((match) => match.active);
    if (active.length === 1) return { credentials: active[0], ambiguous: false };
    logger.warn(
      { accounts: matches.map((match) => match.credentialsId) },
      'Work email shared by several accounts',
    );
    return { credentials: null, ambiguous: true };
  }

  /**
   * Lockouts follow the account, not what was typed, so switching between email and username
   * does not earn extra attempts.
   *
   * @param {string} identifier
   * @param {import('./auth.repository.js').CredentialsRecord | null} credentials
   * @returns {string}
   */
  const throttleKey = (identifier, credentials) =>
    credentials
      ? accountThrottleKey(credentials.credentialsId)
      : `unknown-${identifier.toLowerCase()}`;

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
     * @param {{ identifier: string, password: string }} input
     * @param {ClientInfo} client
     * @returns {Promise<IssuedSession>}
     */
    async login({ identifier, password }, client) {
      const { credentials, ambiguous } = await resolveAccount(identifier);
      const key = throttleKey(identifier, credentials);
      const lockedFor = await loginThrottle.lockedFor(key);
      if (lockedFor !== null) {
        await audit.record({
          action: AUDIT_ACTIONS.LOGIN,
          outcome: AUDIT_OUTCOMES.DENIED,
          employeeId: credentials?.employeeId ?? null,
          details: { identifier, reason: 'locked' },
          ...client,
        });
        throw lockedError(lockedFor);
      }
      if (ambiguous) {
        await audit.record({
          action: AUDIT_ACTIONS.LOGIN,
          outcome: AUDIT_OUTCOMES.DENIED,
          employeeId: null,
          details: { identifier, reason: 'ambiguous_email' },
          ...client,
        });
        throw new AppError(ERROR_CODES.LOGIN_AMBIGUOUS);
      }

      const valid = credentials
        ? await checkPassword(credentials, password)
        : (await verifyAgainstDummy(password), false);

      if (!credentials || !valid) {
        const failures = await loginThrottle.recordFailure(key);
        await audit.record({
          action: AUDIT_ACTIONS.LOGIN,
          outcome: AUDIT_OUTCOMES.FAILURE,
          employeeId: credentials?.employeeId ?? null,
          details: { identifier, failures },
          ...client,
        });
        const nowLocked = await loginThrottle.lockedFor(key);
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

      await loginThrottle.reset(key);
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
     * the whole sign-in (token family) is revoked, unless it was rotated in the last few seconds
     * (another tab of the same sign-in refreshing at the same moment).
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
        // Another tab of this sign-in rotated it a moment ago: not a copied token.
        const justRotated =
          stored.revokedReason === REVOKE_REASONS.ROTATED &&
          stored.revokedSecondsAgo !== null &&
          Number(stored.revokedSecondsAgo) <= REFRESH_GRACE_SECONDS;
        if (stored.revokedAt && !justRotated) return { status: 'reused', stored };
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
        if (!justRotated)
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
      const [employee, credentials, roles, permissionIds, mustChangePassword] = await Promise.all([
        repository.findEmployee(employeeId),
        repository.findCredentialsById(credentialsId),
        repository.findRoles(employeeId),
        repository.findEffectivePermissionIds(employeeId),
        repository.isPasswordChangeRequired(credentialsId),
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
        mustChangePassword,
      };
    },

    /**
     * The signed-in user changes their own password (also how a required change is done). Every
     * other session of the account is signed out; this one gets new tokens.
     *
     * @param {{ employeeId: number, credentialsId: number, currentPassword: string, newPassword: string }} input
     * @param {ClientInfo} client
     * @returns {Promise<IssuedSession>}
     */
    async changePassword({ employeeId, credentialsId, currentPassword, newPassword }, client) {
      const credentials = await repository.findCredentialsById(credentialsId);
      const employee = await repository.findEmployee(employeeId);
      if (!credentials || !employee) throw new AppError(ERROR_CODES.UNAUTHENTICATED);
      if (!(await checkPassword(credentials, currentPassword))) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
          details: [{ path: 'body.currentPassword', message: 'This is not your current password' }],
        });
      }
      assertNotPersonal(newPassword, credentials, employee, 'body.newPassword');
      if (currentPassword === newPassword) {
        throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
          details: [
            { path: 'body.newPassword', message: 'Choose a password you have not just used' },
          ],
        });
      }
      const hash = await hashPassword(newPassword);
      const session = await repository.transaction(async (tx) => {
        await repository.saveUpgradedPassword(
          credentialsId,
          hash,
          legacyFingerprint(credentials.legacyPassword),
          tx,
        );
        await repository.setPasswordChangeRequired(credentialsId, false, null, tx);
        await repository.revokeAllForEmployee(employeeId, REVOKE_REASONS.PASSWORD_CHANGED, tx);
        return issueSession(employeeId, credentialsId, randomUUID(), client, tx);
      });
      await audit.record({
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        employeeId,
        ...client,
      });
      return session;
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

    /**
     * Emails a one-time reset link when the identifier matches one active account with a work
     * email. Says nothing about the outcome: callers always get the same answer, so the form
     * cannot be used to find out which accounts exist.
     *
     * @param {{ identifier: string }} input
     * @param {ClientInfo} client
     * @returns {Promise<void>}
     */
    async requestPasswordReset({ identifier }, client) {
      const { credentials, ambiguous } = await resolveAccount(identifier);
      const employee = credentials ? await repository.findEmployee(credentials.employeeId) : null;
      const email = employee?.email?.trim();

      /** @type {string | null} */
      let skipped = null;
      if (ambiguous) skipped = 'ambiguous_email';
      else if (!credentials || !employee) skipped = 'unknown_account';
      else if (!credentials.active || !employee.active) skipped = 'inactive';
      else if (!email) skipped = 'no_email_on_file';
      else if ((await resetThrottle.lockedFor(throttleKey(identifier, credentials))) !== null)
        skipped = 'throttled';

      if (skipped || !credentials || !employee || !email) {
        if (skipped === 'no_email_on_file') {
          logger.info(
            { credentialsId: credentials?.credentialsId },
            'Password reset requested for an account without email',
          );
        }
        await audit.record({
          action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
          outcome: AUDIT_OUTCOMES.DENIED,
          employeeId: credentials?.employeeId ?? null,
          details: { identifier, reason: skipped },
          ...client,
        });
        return;
      }

      await resetThrottle.recordFailure(throttleKey(identifier, credentials));
      const token = generateRefreshToken();
      await repository.insertPasswordReset({
        credentialsId: credentials.credentialsId,
        tokenHash: hashToken(token),
        expiresAt: new Date(now().getTime() + PASSWORD_RESET_TTL_MS),
        requestIp: client.ipAddress,
      });
      const minutes = PASSWORD_RESET_TTL_MS / MS_PER_MINUTE;
      await mailer.send({
        to: email,
        subject: 'Reset your iHealth Pharmacy password',
        text: [
          `Hello ${employee.firstName},`,
          '',
          'Someone asked to reset the password for your iHealth Pharmacy account',
          `(username: ${credentials.username}). To choose a new password, open this link:`,
          '',
          `${appUrl}/reset-password?token=${encodeURIComponent(token)}`,
          '',
          `The link works once and expires in ${minutes} minutes.`,
          'If you did not ask for this, ignore this email: your password stays the same.',
        ].join('\n'),
      });
      await audit.record({
        action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        employeeId: credentials.employeeId,
        ...client,
      });
    },

    /**
     * Sets a new password from an emailed reset link. The new argon2id hash goes into the additive
     * password table (the legacy column is never written), every sign-in of the account is ended,
     * and the link cannot be used again.
     *
     * @param {{ token: string, password: string }} input
     * @param {ClientInfo} client
     * @returns {Promise<void>}
     */
    async resetPassword({ token, password }, client) {
      const invalid = () => new AppError(ERROR_CODES.RESET_TOKEN_INVALID);
      const reset = await repository.findPasswordReset(hashToken(token));
      if (!reset || reset.usedAt || reset.expiresAt.getTime() <= now().getTime()) throw invalid();

      const credentials = await repository.findCredentialsById(reset.credentialsId);
      const employee = credentials ? await repository.findEmployee(credentials.employeeId) : null;
      if (!credentials?.active || !employee?.active) throw invalid();

      assertNotPersonal(password, credentials, employee, 'body.password');

      const hash = await hashPassword(password);
      await repository.transaction(async (tx) => {
        const current = await repository.findPasswordReset(hashToken(token), tx);
        // Re-checked inside the transaction (row lock), so two tabs cannot both use one link.
        if (!current || current.usedAt) throw invalid();
        await repository.saveUpgradedPassword(
          credentials.credentialsId,
          hash,
          legacyFingerprint(credentials.legacyPassword),
          tx,
        );
        await repository.closePasswordResets(credentials.credentialsId, tx);
        await repository.revokeAllForEmployee(
          credentials.employeeId,
          REVOKE_REASONS.PASSWORD_RESET,
          tx,
        );
      });
      await loginThrottle.reset(throttleKey(credentials.username, credentials));
      await audit.record({
        action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        employeeId: credentials.employeeId,
        ...client,
      });
    },
  };
}

/**
 * Refuses a password equal to the account's username or email.
 *
 * @param {string} password
 * @param {{ username: string }} credentials
 * @param {{ email: string | null }} employee
 * @param {string} path Field the error belongs to, e.g. `body.password`.
 * @param {'your' | 'their'} [whose] "your" when people choose their own password, "their" for an administrator.
 * @returns {void}
 */
export function assertNotPersonal(password, credentials, employee, path, whose = 'your') {
  const lowered = password.toLowerCase();
  if (
    lowered === credentials.username.toLowerCase() ||
    lowered === employee.email?.trim().toLowerCase()
  ) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
      details: [{ path, message: `Choose a password that is not ${whose} username or email` }],
    });
  }
}

/** @typedef {ReturnType<typeof createAuthService>} AuthService */
