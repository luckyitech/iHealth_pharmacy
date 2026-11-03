import { ERROR_CODES, toErrorDetails } from '@ihealth/shared/errors';
import { ZodError } from 'zod';

import { AppError } from '../lib/errors.js';
import { getRequestId } from '../lib/request-context.js';

const SERVER_ERROR_STATUS = 500;

// Prisma error codes that describe a client problem rather than a server fault.
const PRISMA_ERRORS = Object.freeze({
  P2002: ERROR_CODES.CONFLICT, // unique constraint
  P2003: ERROR_CODES.CONFLICT, // foreign key constraint
  P2025: ERROR_CODES.NOT_FOUND, // record to update/delete does not exist
});

/**
 * @param {unknown} error
 * @returns {AppError}
 */
function toAppError(error) {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError(ERROR_CODES.VALIDATION_FAILED, {
      details: toErrorDetails(error),
      cause: error,
    });
  }
  const candidate = /** @type {{ type?: string, code?: string, status?: number }} */ (error ?? {});
  if (candidate.type === 'entity.parse.failed') {
    return new AppError(ERROR_CODES.VALIDATION_FAILED, {
      message: 'The request body is not valid JSON.',
      cause: error,
    });
  }
  if (candidate.type === 'entity.too.large') {
    return new AppError(ERROR_CODES.VALIDATION_FAILED, {
      message: 'The request body is too large.',
      cause: error,
    });
  }
  const prismaCode =
    candidate.code && PRISMA_ERRORS[/** @type {keyof typeof PRISMA_ERRORS} */ (candidate.code)];
  if (prismaCode) return new AppError(prismaCode, { cause: error });
  return new AppError(ERROR_CODES.INTERNAL_ERROR, { cause: error });
}

/**
 * Last middleware in the chain: turns any error into the shared error response shape.
 * Stack traces and internal messages are logged, never sent.
 *
 * @returns {import('express').ErrorRequestHandler}
 */
export function errorHandler() {
  return (error, req, res, _next) => {
    const appError = toAppError(error);
    if (appError.status >= SERVER_ERROR_STATUS) {
      req.log.error({ err: error }, 'Unhandled error');
    } else {
      req.log.info({ code: appError.code, status: appError.status }, appError.message);
    }
    if (res.headersSent) return;
    if (appError.headers) res.set(appError.headers);
    res.status(appError.status).json({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        requestId: getRequestId(),
      },
    });
  };
}

/**
 * @returns {import('express').RequestHandler}
 */
export function notFoundHandler() {
  return (req, _res, next) => {
    next(
      new AppError(ERROR_CODES.NOT_FOUND, { message: `No route for ${req.method} ${req.path}` }),
    );
  };
}
