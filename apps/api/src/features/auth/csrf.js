import { doubleCsrf } from 'csrf-csrf';

import { COOKIES, CSRF_HEADER } from './auth.constants.js';

/**
 * Signed double-submit CSRF tokens, bound to the sign-in (the session cookie holds the token family id).
 * The browser reads the token from the login, refresh or GET /auth/csrf response and sends it back in
 * the `x-csrf-token` header on every state-changing request.
 *
 * @param {{ secret: string, secureCookies: boolean }} options
 * @returns `{ issue, protect }`.
 */
export function createCsrf({ secret, secureCookies }) {
  const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: (req) => String(req.cookies?.[COOKIES.SESSION] ?? ''),
    // The __Host- prefix makes browsers reject the cookie unless it is Secure, host-only and path=/.
    cookieName: secureCookies ? '__Host-ihealth_csrf' : 'ihealth_csrf',
    cookieOptions: { sameSite: 'strict', secure: secureCookies, httpOnly: true, path: '/' },
    getCsrfTokenFromRequest: (req) => req.get(CSRF_HEADER),
  });
  return {
    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @returns {string}
     */
    issue: (req, res) => generateCsrfToken(req, res, { overwrite: true }),
    protect: doubleCsrfProtection,
  };
}

/** @typedef {ReturnType<typeof createCsrf>} Csrf */
