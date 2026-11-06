/**
 * Gives every account in the Docker development database one shared test approval PIN, so
 * approvals can be tried without anyone's real PIN. Writes the PIN where both apps look: the legacy
 * column (plain text, as the legacy app keeps it) and the hashed copy the new app keeps, with its
 * wrong-try count and lock reset.
 *
 *   npm run db:dev-test-pins
 *
 * The PIN is DEV_TEST_PIN in .env (made, six digits, the first time). Real PINs are never read out.
 * Docker copy only; run it again after `npm run db:copy`, which replaces the database.
 */
import { randomInt } from 'node:crypto';

import { hashPassword, legacyFingerprint } from '../src/features/auth/password-hasher.js';
import { connectToDevDatabase, passwordFromEnv } from './lib/dev-db.js';

const PIN_DIGITS = 6;

const { password: pin } = passwordFromEnv(
  'DEV_TEST_PIN',
  'Shared test approval PIN for every account (npm run db:dev-test-pins)',
  String(randomInt(10 ** (PIN_DIGITS - 1), 10 ** PIN_DIGITS)),
);

const { connection, database } = await connectToDevDatabase();
try {
  // One hash for all accounts: argon2id is deliberately slow, and the salt adds nothing for a shared test value.
  const hash = await hashPassword(pin);
  await connection.beginTransaction();
  const updated = await connection.query(
    'UPDATE employee_credentials SET APPROVAL_ACCESS_PIN = ?',
    [pin],
  );
  await connection.query(
    `INSERT INTO ih_approval_pin (EMPLOYEE_ID, PIN_HASH, LEGACY_FINGERPRINT, FAILED_COUNT, LOCKED_UNTIL)
     SELECT DISTINCT EMPLOYEE_ID, ?, ?, 0, NULL FROM employee_credentials
     ON DUPLICATE KEY UPDATE PIN_HASH = VALUES(PIN_HASH),
       LEGACY_FINGERPRINT = VALUES(LEGACY_FINGERPRINT), FAILED_COUNT = 0, LOCKED_UNTIL = NULL`,
    [hash, legacyFingerprint(pin)],
  );
  await connection.commit();
  process.stdout.write(
    `${Number(updated.affectedRows)} accounts in ${database} (Docker) now approve with DEV_TEST_PIN from .env.\n`,
  );
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
