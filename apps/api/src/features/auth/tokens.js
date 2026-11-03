import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';

import { ACCESS_TOKEN_TTL_SECONDS, TOKEN_AUDIENCE, TOKEN_ISSUER } from './auth.constants.js';

const ALGORITHM = 'HS256';
const REFRESH_TOKEN_BYTES = 32;

/**
 * @typedef {object} AccessClaims
 * @property {number} employeeId
 * @property {number} credentialsId
 * @property {string} familyId Refresh-token family (one per sign-in).
 */

/**
 * @param {string} secret
 * @returns {{ sign: (claims: AccessClaims) => Promise<string>, verify: (token: string) => Promise<AccessClaims> }}
 */
export function createAccessTokens(secret) {
  const key = new TextEncoder().encode(secret);
  return {
    sign: ({ employeeId, credentialsId, familyId }) =>
      new SignJWT({ cid: credentialsId, fam: familyId })
        .setProtectedHeader({ alg: ALGORITHM })
        .setSubject(String(employeeId))
        .setIssuer(TOKEN_ISSUER)
        .setAudience(TOKEN_AUDIENCE)
        .setIssuedAt()
        .setJti(randomUUID())
        .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
        .sign(key),
    verify: async (token) => {
      const { payload } = await jwtVerify(token, key, {
        algorithms: [ALGORITHM],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
      });
      return {
        employeeId: Number(payload.sub),
        credentialsId: Number(payload.cid),
        familyId: String(payload.fam),
      };
    },
  };
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export const isExpiredTokenError = (error) => error instanceof joseErrors.JWTExpired;

/**
 * Opaque refresh token: 256 random bits. Only its hash is stored.
 *
 * @returns {string}
 */
export function generateRefreshToken() {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

/**
 * @param {string} token
 * @returns {string} SHA-256 hex
 */
export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
