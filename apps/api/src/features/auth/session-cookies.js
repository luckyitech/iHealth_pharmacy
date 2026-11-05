import { MS_PER_SECOND } from '@ihealth/shared/units';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  COOKIES,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants.js';

/**
 * @param {boolean} secure
 * @returns {import('express').CookieOptions}
 */
const baseOptions = (secure) => ({ httpOnly: true, secure, sameSite: 'strict' });

/**
 * Tokens only ever travel in httpOnly cookies, so page scripts (and XSS) cannot read them.
 *
 * @param {import('express').Response} res
 * @param {{ accessToken: string, refreshToken: string, familyId: string }} session
 * @param {boolean} secure
 */
export function setSessionCookies(res, { accessToken, refreshToken, familyId }, secure) {
  res.cookie(COOKIES.ACCESS, accessToken, {
    ...baseOptions(secure),
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * MS_PER_SECOND,
  });
  res.cookie(COOKIES.REFRESH, refreshToken, {
    ...baseOptions(secure),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
  res.cookie(COOKIES.SESSION, familyId, {
    ...baseOptions(secure),
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

/**
 * @param {import('express').Response} res
 * @param {boolean} secure
 */
export function clearSessionCookies(res, secure) {
  res.clearCookie(COOKIES.ACCESS, { ...baseOptions(secure), path: '/' });
  res.clearCookie(COOKIES.REFRESH, { ...baseOptions(secure), path: REFRESH_COOKIE_PATH });
  res.clearCookie(COOKIES.SESSION, { ...baseOptions(secure), path: '/' });
}
