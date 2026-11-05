import { ERROR_CODES, ERROR_MESSAGES } from '@ihealth/shared/error-codes';

/**
 * An error returned by the API, in the shared error shape. Components branch on `code`.
 */
export class ApiError extends Error {
  /**
   * @param {object} options
   * @param {number} options.status
   * @param {import('@ihealth/shared/error-codes').ErrorCode} options.code
   * @param {string} options.message
   * @param {import('@ihealth/shared/errors').ErrorDetail[]} [options.details]
   * @param {string} [options.requestId] Quote this when reporting a problem.
   */
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

/**
 * @param {unknown} error
 * @returns {error is ApiError}
 */
export const isApiError = (error) => error instanceof ApiError;

/**
 * A message that is always safe and useful to show, whatever went wrong.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  if (isApiError(error)) return error.message;
  if (error instanceof TypeError)
    return 'Cannot reach the server. Check your connection and try again.';
  return ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR];
}
