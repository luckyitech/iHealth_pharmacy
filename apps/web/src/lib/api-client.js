import { ERROR_CODES } from '@ihealth/shared/error-codes';
import ky, { isHTTPError } from 'ky';

import { ApiError } from './api-error.js';
import { getCsrfToken, setCsrfToken } from './csrf-token.js';
import { notify } from './notify.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';
const REQUEST_TIMEOUT_MS = 30_000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REFRESH_PATH = 'auth/refresh';
const RETRIED_HEADER = 'x-ihealth-retried';

/** @type {Promise<boolean> | null} */
let refreshInFlight = null;

/**
 * Renews the session once, however many requests failed at the same time.
 *
 * @returns {Promise<boolean>}
 */
function refreshSession() {
  refreshInFlight ??= ky
    .post(REFRESH_PATH, {
      prefix: API_BASE_URL,
      baseUrl: window.location.origin,
      credentials: 'include',
      retry: 0,
    })
    .json()
    .then((/** @type {{ data: { csrfToken: string } }} */ body) => {
      setCsrfToken(body.data.csrfToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** One network-error notification at a time, however many requests fail. */
const NETWORK_ERROR_ID = 'network-error';

/** Listeners told when the session ends (refresh failed), so the app can return to the sign-in page. */
const sessionEndedListeners = new Set();

/**
 * @param {() => void} listener
 * @returns {() => void} Unsubscribe.
 */
export function onSessionEnded(listener) {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

/** Listeners told when the API says a temporary password must be changed first. */
const passwordChangeListeners = new Set();

/**
 * @param {() => void} listener
 * @returns {() => void} Unsubscribe.
 */
export function onPasswordChangeRequired(listener) {
  passwordChangeListeners.add(listener);
  return () => passwordChangeListeners.delete(listener);
}

/**
 * @typedef {{ error?: { code?: import('@ihealth/shared/error-codes').ErrorCode, message?: string, details?: import('@ihealth/shared/errors').ErrorDetail[], requestId?: string } }} ErrorBody
 */

/**
 * @param {Response} response
 * @param {unknown} [parsedBody] Ky's HTTPError has already read the body into `error.data`.
 * @returns {Promise<ApiError>}
 */
async function toApiError(response, parsedBody) {
  let body = /** @type {ErrorBody | null} */ (parsedBody ?? null);
  if (!body) {
    try {
      body = await response.clone().json();
    } catch {
      // Not JSON (e.g. a proxy error page): fall through to a generic error.
    }
  }
  const error = body?.error;
  return new ApiError({
    status: response.status,
    code: error?.code ?? ERROR_CODES.INTERNAL_ERROR,
    message: error?.message ?? 'Something went wrong. Please try again.',
    details: error?.details,
    requestId: error?.requestId ?? response.headers.get('x-request-id') ?? undefined,
  });
}

/**
 * The one HTTP client of the app: cookies included, CSRF header on writes, an automatic session
 * refresh (once) on SESSION_EXPIRED, and API errors converted to ApiError.
 */
export const api = ky.create({
  prefix: API_BASE_URL,
  // Same-origin by default (the dev server proxies /api); an absolute VITE_API_BASE_URL bypasses this.
  baseUrl: window.location.origin,
  credentials: 'include',
  timeout: REQUEST_TIMEOUT_MS,
  // Only idempotent reads are retried automatically, and only when a gateway is briefly unavailable.
  retry: { limit: 1, methods: ['get'], statusCodes: [502, 503, 504] },
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const csrf = getCsrfToken();
        if (csrf && !SAFE_METHODS.has(request.method)) request.headers.set('x-csrf-token', csrf);
      },
    ],
    afterResponse: [
      async ({ response }) => {
        // An administrator set a temporary password while this user was signed in.
        if (response.status === 403) {
          const { code } = await toApiError(response);
          if (code === ERROR_CODES.PASSWORD_CHANGE_REQUIRED)
            passwordChangeListeners.forEach((listener) => listener());
        }
        return response;
      },
      async ({ request, response }) => {
        if (
          response.status !== 401 ||
          request.url.endsWith(REFRESH_PATH) ||
          request.headers.has(RETRIED_HEADER)
        ) {
          return response;
        }
        const { code } = await toApiError(response);
        if (code !== ERROR_CODES.SESSION_EXPIRED) return response;
        if (!(await refreshSession())) {
          sessionEndedListeners.forEach((listener) => listener());
          return response;
        }
        // Replay the request once with the new cookies (sent automatically) and the new CSRF token.
        const headers = new Headers(request.headers);
        headers.set(RETRIED_HEADER, '1');
        return api(new Request(request, { headers }));
      },
    ],
    beforeError: [
      async ({ error }) => {
        if (isHTTPError(error)) return toApiError(error.response, error.data);
        // No answer at all (offline, server down, timeout): say so once, whatever the screen.
        notify.error('Cannot reach the server. Check the connection and try again.', {
          id: NETWORK_ERROR_ID,
        });
        return error;
      },
    ],
  },
});
