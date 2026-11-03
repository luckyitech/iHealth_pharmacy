import { createHash, timingSafeEqual } from 'node:crypto';

import { Algorithm, hash, verify } from '@node-rs/argon2';
import bcrypt from 'bcryptjs';

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations, 1 lane).
const ARGON2_OPTIONS = Object.freeze({
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

// Same pattern as the legacy LegacyAwarePasswordEncoder: anything else is treated as plain text.
const BCRYPT_HASH = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * @param {string} password
 * @returns {Promise<string>}
 */
export function hashPassword(password) {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * @param {string} storedHash argon2id hash from ih_employee_password
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(storedHash, password) {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/**
 * Verifies a secret against a value stored by the legacy system: a BCrypt hash or, for older
 * rows, plain text. Used for passwords and approval PINs. Plain text is compared in constant time.
 *
 * @param {string | null | undefined} stored
 * @param {string} candidate
 * @returns {Promise<boolean>}
 */
export async function verifyLegacySecret(stored, candidate) {
  if (!stored) return false;
  if (BCRYPT_HASH.test(stored)) return bcrypt.compare(candidate, stored);
  const expected = Buffer.from(stored, 'utf8');
  const actual = Buffer.from(candidate, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Detects whether the legacy password changed since we upgraded it, without storing it.
 *
 * @param {string} legacyValue
 * @returns {string} SHA-256 hex
 */
export function legacyFingerprint(legacyValue) {
  return createHash('sha256').update(legacyValue, 'utf8').digest('hex');
}

let dummyHash = /** @type {Promise<string> | undefined} */ (undefined);

/**
 * Spends the same time as a real verification, so unknown usernames cannot be told apart by timing.
 *
 * @param {string} password
 * @returns {Promise<void>}
 */
export async function verifyAgainstDummy(password) {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}
