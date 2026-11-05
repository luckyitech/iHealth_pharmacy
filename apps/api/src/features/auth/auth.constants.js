import { MS_PER_MINUTE as MINUTE_MS } from '@ihealth/shared/units';

const DAY_MS = 24 * 60 * MINUTE_MS;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * DAY_MS;
export const PASSWORD_RESET_TTL_MS = 30 * MINUTE_MS;

export const TOKEN_ISSUER = 'ihealth-api';
export const TOKEN_AUDIENCE = 'ihealth-web';

/** Sign-in lockout: this many consecutive failures lock the username for LOCKOUT_SECONDS. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 15 * 60;

export const COOKIES = Object.freeze({
  ACCESS: 'ihealth_access',
  REFRESH: 'ihealth_refresh',
  // Identifies the sign-in (refresh-token family) so CSRF tokens survive token rotation.
  SESSION: 'ihealth_session',
});

/** The refresh cookie is only sent to the endpoints that use it. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const CSRF_HEADER = 'x-csrf-token';

/**
 * The account lockout key, shared by sign-in and the administrator's "unlock".
 *
 * @param {number} credentialsId
 * @returns {string}
 */
export const accountThrottleKey = (credentialsId) => `account-${credentialsId}`;

export const REVOKE_REASONS = Object.freeze({
  ROTATED: 'ROTATED',
  LOGOUT: 'LOGOUT',
  REUSE_DETECTED: 'REUSE_DETECTED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  ADMIN_PASSWORD_SET: 'ADMIN_PASSWORD_SET',
  LOGIN_DISABLED: 'LOGIN_DISABLED',
});

export const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  REFRESH_REUSE: 'auth.refresh_reuse',
  PASSWORD_UPGRADED: 'auth.password_upgraded',
  PERMISSION_DENIED: 'auth.permission_denied',
  APPROVAL_PIN: 'auth.approval_pin',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'auth.password_reset_completed',
  PASSWORD_CHANGED: 'auth.password_changed',
});
