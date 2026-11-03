/**
 * Stable, client-facing error codes. Clients branch on `code`, never on `message`.
 * Each code has exactly one HTTP status.
 */
export const ERROR_CODES = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  CSRF_INVALID: 'CSRF_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  APPROVAL_PIN_INVALID: 'APPROVAL_PIN_INVALID',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
});

/** @typedef {keyof typeof ERROR_CODES} ErrorCode */

/** @type {Readonly<Record<ErrorCode, number>>} */
export const ERROR_HTTP_STATUS = Object.freeze({
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  ACCOUNT_INACTIVE: 403,
  TWO_FACTOR_REQUIRED: 403,
  CSRF_INVALID: 403,
  FORBIDDEN: 403,
  APPROVAL_PIN_INVALID: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ACCOUNT_LOCKED: 423,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
});

/** @type {Readonly<Record<ErrorCode, string>>} Default, user-safe messages. */
export const ERROR_MESSAGES = Object.freeze({
  VALIDATION_FAILED: 'Some fields are invalid.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  INVALID_CREDENTIALS: 'The username or password is incorrect.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  ACCOUNT_INACTIVE: 'This account is not active. Contact your administrator.',
  TWO_FACTOR_REQUIRED:
    'This account uses two-factor sign-in, which the new system does not support yet. Use the current system for now.',
  CSRF_INVALID: 'Your session could not be verified. Refresh the page and try again.',
  FORBIDDEN: 'You do not have permission to do this.',
  APPROVAL_PIN_INVALID: 'The approval PIN is incorrect.',
  NOT_FOUND: 'The requested item was not found.',
  CONFLICT: 'This change conflicts with the current data.',
  ACCOUNT_LOCKED: 'Too many failed sign-in attempts. Try again later.',
  RATE_LIMITED: 'Too many requests. Please slow down and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again shortly.',
});
