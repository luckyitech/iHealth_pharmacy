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
import { randomBytes } from 'node:crypto';

import { hashPassword, legacyFingerprint } from '../src/features/auth/password-hasher.js';
import { connectToDevDatabase, passwordFromEnv } from './lib/dev-db.js';

const USERNAME = 'dev.admin';
const EMAIL = 'dev.admin@localhost';
const CREATED_BY = 'dev-admin-script';

const { password, generated } = passwordFromEnv(
  'DEV_ADMIN_PASSWORD',
  'Local admin created by npm run db:dev-admin',
);
const { connection, database } = await connectToDevDatabase();

try {
  await connection.beginTransaction();

  const [pharmacy] = await connection.query(
    "SELECT MIN(PHARMACY_ID) AS id FROM pharmacy WHERE ACTIVE_S = 'Y'",
  );
  if (!pharmacy?.id) throw new Error('No active pharmacy found');

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
