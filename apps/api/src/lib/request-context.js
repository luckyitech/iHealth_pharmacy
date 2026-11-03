import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * @typedef {object} RequestContext
 * @property {string} requestId
 * @property {number} [employeeId] Set once the request is authenticated.
 */

const storage = new AsyncLocalStorage();

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept a caller-supplied id only if it is short and harmless to log.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * @returns {RequestContext | undefined}
 */
export function getRequestContext() {
  return storage.getStore();
}

/**
 * @returns {string | undefined}
 */
export function getRequestId() {
  return storage.getStore()?.requestId;
}

/**
 * Starts a context for every request so the logger, error handler and audit log share one request id.
 *
 * @returns {import('express').RequestHandler}
 */
export function requestContext() {
  return (req, res, next) => {
    const incoming = req.get(REQUEST_ID_HEADER);
    const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, requestId);
    storage.run({ requestId }, next);
  };
}
