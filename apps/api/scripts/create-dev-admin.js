/**
 * Creates (or refreshes) a local administrator account in the Docker development database:
 * username `dev.admin`, email `dev.admin@localhost`, every legacy permission, no two-factor sign-in.
 *
 *   npm run db:dev-admin
 *
 * The password comes from DEV_ADMIN_PASSWORD in the root .env. If it is not set, a random one is
 * generated and saved there (.env is git-ignored). It is stored only as an argon2id hash.
 * The script refuses to run against anything but the Docker development database.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import mariadb from 'mariadb';

import { hashPassword, legacyFingerprint } from '../src/features/auth/password-hasher.js';

const USERNAME = 'dev.admin';
const EMAIL = 'dev.admin@localhost';
const CREATED_BY = 'dev-admin-script';
const PASSWORD_LENGTH = 14;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const envFile = path.join(repoRoot, '.env');
loadEnv({ path: envFile, quiet: true });

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  process.stderr.write(`create-dev-admin: ${message}\n`);
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL ?? fail('DATABASE_URL is not set'));
const database = url.pathname.replace(/^\//, '');
const devPort = process.env.DEV_DB_PORT ?? '3307';
const devName = process.env.DEV_DB_NAME ?? 'ihealthpharm';
// Never the legacy server: only a local host, on the Docker port, with the Docker database name.
if (!LOCAL_HOSTS.has(url.hostname) || url.port !== devPort || database !== devName) {
  fail(
    `refusing to run: DATABASE_URL must point at the Docker dev database (localhost:${devPort}/${devName})`,
  );
}
if (url.port === (process.env.LEGACY_DB_PORT ?? '3306'))
  fail('refusing to run against the legacy server port');

/** @returns {string} */
function generatePassword() {
  return Array.from(
    { length: PASSWORD_LENGTH },
    () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
  ).join('');
}

let password = process.env.DEV_ADMIN_PASSWORD;
let generated = false;
if (!password) {
  password = generatePassword();
  generated = true;
  const current = readFileSync(envFile, 'utf8');
  appendFileSync(
    envFile,
    `${current.endsWith('\n') ? '' : '\n'}\n# Local admin created by npm run db:dev-admin\nDEV_ADMIN_PASSWORD=${password}\n`,
  );
}

const connection = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database,
  allowPublicKeyRetrieval: true,
});

try {
  await connection.beginTransaction();

  const [pharmacy] = await connection.query(
    "SELECT MIN(PHARMACY_ID) AS id FROM pharmacy WHERE ACTIVE_S = 'Y'",
  );
  if (!pharmacy?.id) fail('no active pharmacy found');

  let [employee] = await connection.query(
    'SELECT EMPLOYEE_ID AS id FROM employee WHERE EMAIL_ID = ?',
    [EMAIL],
  );
  if (!employee) {
    const result = await connection.query(
      `INSERT INTO employee (FIRST_NM, LAST_NM, EMAIL_ID, PHARMACY_ID, ACTIVE_S, EMPLOYEE_CD,
                             CREATION_USER_ID, LAST_UPDATE_TS)
       VALUES ('Dev', 'Admin', ?, ?, 'Y', 'DEV-ADMIN', ?, NOW())`,
      [EMAIL, pharmacy.id, CREATED_BY],
    );
    employee = { id: Number(result.insertId) };
  } else {
    await connection.query("UPDATE employee SET ACTIVE_S = 'Y' WHERE EMPLOYEE_ID = ?", [
      employee.id,
    ]);
  }

  let [credentials] = await connection.query(
    'SELECT EMPLOYEE_CREDENTIALS_ID AS id, CURRENT_PASSWORD AS legacy FROM employee_credentials WHERE USER_NM = ?',
    [USERNAME],
  );
  if (!credentials) {
    // The legacy column needs a value; a random one nobody knows keeps the legacy check unusable.
    const legacy = randomBytes(32).toString('hex');
    const result = await connection.query(
      `INSERT INTO employee_credentials (EMPLOYEE_ID, USER_NM, CURRENT_PASSWORD, ACTIVE_S, PASSWORD_STATUS,
                                         TWO_FACTOR_ENABLED_S, CREATION_USER_ID)
       VALUES (?, ?, ?, 'Y', 1, 'N', ?)`,
      [employee.id, USERNAME, legacy, CREATED_BY],
    );
    credentials = { id: Number(result.insertId), legacy };
  } else {
    await connection.query(
      "UPDATE employee_credentials SET ACTIVE_S = 'Y', TWO_FACTOR_ENABLED_S = 'N' WHERE EMPLOYEE_CREDENTIALS_ID = ?",
      [credentials.id],
    );
  }

  await connection.query(
    `INSERT INTO ih_employee_password (EMPLOYEE_CREDENTIALS_ID, PASSWORD_HASH, LEGACY_FINGERPRINT)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE PASSWORD_HASH = VALUES(PASSWORD_HASH), LEGACY_FINGERPRINT = VALUES(LEGACY_FINGERPRINT)`,
    [credentials.id, await hashPassword(password), legacyFingerprint(credentials.legacy)],
  );

  await connection.query("UPDATE employee_access SET ACTIVE_S = 'Y' WHERE EMPLOYEE_ID = ?", [
    employee.id,
  ]);
  const granted = await connection.query(
    `INSERT INTO employee_access (EMPLOYEE_ID, PHARMA_ACCESS_ID, ACTIVE_S, CREATION_USER_ID)
     SELECT ?, pa.PHARMA_ACCESS_ID, 'Y', ?
     FROM pharma_access pa
     WHERE NOT EXISTS (SELECT 1 FROM employee_access ea WHERE ea.EMPLOYEE_ID = ? AND ea.PHARMA_ACCESS_ID = pa.PHARMA_ACCESS_ID)`,
    [employee.id, CREATED_BY, employee.id],
  );

  await connection.commit();
  const [{ total }] = await connection.query(
    "SELECT COUNT(*) AS total FROM employee_access WHERE EMPLOYEE_ID = ? AND ACTIVE_S = 'Y'",
    [employee.id],
  );
  process.stdout.write(
    [
      `Local admin ready in ${database} (Docker): username ${USERNAME} or email ${EMAIL}.`,
      `Permissions: ${Number(total)} granted (${Number(granted.affectedRows)} new).`,
      generated
        ? 'Password: generated and saved as DEV_ADMIN_PASSWORD in .env.'
        : 'Password: DEV_ADMIN_PASSWORD from .env.',
      '',
    ].join('\n'),
  );
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
