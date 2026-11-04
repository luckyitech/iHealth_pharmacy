import { randomInt } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import mariadb from 'mariadb';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const PASSWORD_LENGTH = 14;
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const envFile = path.join(repoRoot, '.env');
loadEnv({ path: envFile, quiet: true });

/**
 * @param {string} message
 * @returns {never}
 */
export function fail(message) {
  process.stderr.write(`${path.basename(process.argv[1])}: ${message}\n`);
  process.exit(1);
}

/**
 * Connects to the Docker development database, and only to it: a local host, on the Docker port,
 * with the Docker database name. Anything else (above all the legacy server) is refused.
 *
 * @returns {Promise<{ connection: import('mariadb').Connection, database: string }>}
 */
export async function connectToDevDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? fail('DATABASE_URL is not set'));
  const database = url.pathname.replace(/^\//, '');
  const devPort = process.env.DEV_DB_PORT ?? '3307';
  const devName = process.env.DEV_DB_NAME ?? 'ihealthpharm';
  if (!LOCAL_HOSTS.has(url.hostname) || url.port !== devPort || database !== devName) {
    fail(
      `refusing to run: DATABASE_URL must point at the Docker dev database (localhost:${devPort}/${devName})`,
    );
  }
  if (url.port === (process.env.LEGACY_DB_PORT ?? '3306'))
    fail('refusing to run against the legacy server port');
  const connection = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    allowPublicKeyRetrieval: true,
  });
  return { connection, database };
}

/**
 * Reads a password from .env, or generates one and saves it there (.env is git-ignored).
 *
 * @param {string} name e.g. DEV_ADMIN_PASSWORD
 * @param {string} comment Written above the new line in .env.
 * @param {string} [fallback] Saved instead of a random password.
 * @returns {{ password: string, generated: boolean }}
 */
export function passwordFromEnv(name, comment, fallback) {
  const existing = process.env[name];
  if (existing) return { password: existing, generated: false };
  const password =
    fallback ??
    Array.from(
      { length: PASSWORD_LENGTH },
      () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)],
    ).join('');
  const current = readFileSync(envFile, 'utf8');
  appendFileSync(
    envFile,
    `${current.endsWith('\n') ? '' : '\n'}\n# ${comment}\n${name}=${password}\n`,
  );
  return { password, generated: true };
}
