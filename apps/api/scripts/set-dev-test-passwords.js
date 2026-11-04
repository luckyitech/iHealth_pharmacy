/**
 * Makes every account in the Docker development database usable for testing with one shared password:
 * it stores an argon2id hash of DEV_TEST_PASSWORD for each account in ih_employee_password (the new
 * app checks that first) and switches off two-factor sign-in, which the new app does not support yet.
 *
 *   npm run db:dev-test-passwords
 *
 * The legacy password and PIN columns are not touched. Existing passwords are never read out.
 * Run it again after `npm run db:copy`, which replaces the database.
 */
import { hashPassword, legacyFingerprint } from '../src/features/auth/password-hasher.js';
import { connectToDevDatabase, passwordFromEnv } from './lib/dev-db.js';

const DEFAULT_TEST_PASSWORD = 'Test@2026pharm';

const { password } = passwordFromEnv(
  'DEV_TEST_PASSWORD',
  'Shared test password for every account (npm run db:dev-test-passwords)',
  DEFAULT_TEST_PASSWORD,
);

const { connection, database } = await connectToDevDatabase();
try {
  /** @type {{ id: number, legacy: string }[]} */
  const accounts = await connection.query(
    // dev.admin keeps its own password (npm run db:dev-admin).
    "SELECT EMPLOYEE_CREDENTIALS_ID AS id, CURRENT_PASSWORD AS legacy FROM employee_credentials WHERE USER_NM <> 'dev.admin'",
  );
  // One hash for all accounts: argon2id is deliberately slow, and the salt adds nothing for a shared test value.
  const hash = await hashPassword(password);

  await connection.beginTransaction();
  for (const account of accounts) {
    await connection.query(
      `INSERT INTO ih_employee_password (EMPLOYEE_CREDENTIALS_ID, PASSWORD_HASH, LEGACY_FINGERPRINT)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE PASSWORD_HASH = VALUES(PASSWORD_HASH), LEGACY_FINGERPRINT = VALUES(LEGACY_FINGERPRINT)`,
      [account.id, hash, legacyFingerprint(account.legacy)],
    );
  }
  const twoFactor = await connection.query(
    "UPDATE employee_credentials SET TWO_FACTOR_ENABLED_S = 'N' WHERE TWO_FACTOR_ENABLED_S = 'Y'",
  );
  await connection.commit();

  process.stdout.write(
    `${accounts.length} accounts in ${database} (Docker) now sign in with DEV_TEST_PASSWORD from .env; ` +
      `two-factor switched off for ${Number(twoFactor.affectedRows)}.\n`,
  );
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
