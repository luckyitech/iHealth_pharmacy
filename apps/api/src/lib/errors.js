import { ERROR_CODES, ERROR_HTTP_STATUS, ERROR_MESSAGES } from '@ihealth/shared/errors';

/** @typedef {import('@ihealth/shared/errors').ErrorCode} ErrorCode */
/** @typedef {import('@ihealth/shared/errors').ErrorDetail} ErrorDetail */

/**
 * An error that is safe to show to API clients. Its `code` decides the HTTP status.
 * Anything that is not an AppError is reported to clients as INTERNAL_ERROR.
 */
export class AppError extends Error {
  /**
   * @param {ErrorCode} code
   * @param {object} [options]
   * @param {string} [options.message] Client-facing message; defaults to the shared message for the code.
   * @param {ErrorDetail[]} [options.details]
   * @param {Record<string, string>} [options.headers] Extra response headers (e.g. Retry-After).
   * @param {unknown} [options.cause] Underlying error, logged but never sent to the client.
   */
  constructor(code, { message, details, headers, cause } = {}) {
    super(message ?? ERROR_MESSAGES[code], { cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_HTTP_STATUS[code];
    this.details = details;
    this.headers = headers;
  }
}

/**
 * @param {string} [message]
 * @returns {AppError}
 */
export const notFound = (message) => new AppError(ERROR_CODES.NOT_FOUND, { message });

/**
 * @param {string} [message]
 * @returns {AppError}
 */
export const forbidden = (message) => new AppError(ERROR_CODES.FORBIDDEN, { message });

/**
 * @param {string} [message]
 * @returns {AppError}
 */
export const conflict = (message) => new AppError(ERROR_CODES.CONFLICT, { message });

/**
 * @param {ErrorDetail[]} details
 * @returns {AppError}
 */
export const validationFailed = (details) =>
  new AppError(ERROR_CODES.VALIDATION_FAILED, { details });
