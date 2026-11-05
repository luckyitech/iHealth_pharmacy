import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient } from '@prisma/client';
export { additiveTables, missingAdditiveTables } from './additive-tables.js';

/**
 * @typedef {object} CreatePrismaClientOptions
 * @property {string} url MySQL connection URL, e.g. `mysql://user:pass@host:3306/ihealthpharm`.
 *   Add `?allowPublicKeyRetrieval=true` for local, non-TLS MySQL 9 servers.
 * @property {number} [connectionLimit] Maximum pooled connections.
 * @property {string} timezone Offset the data is stored in, e.g. `+03:00` (config DB_TIME_ZONE).
 * @property {import('@prisma/client').Prisma.LogLevel[]} [log] Prisma log levels to emit.
 */

const DEFAULT_CONNECTION_LIMIT = 10;

/**
 * Creates a Prisma client for the legacy schema, using the MariaDB driver adapter (MySQL-compatible).
 *
 * @param {CreatePrismaClientOptions} options
 * @returns {PrismaClient}
 */
export function createPrismaClient({
  url,
  timezone,
  connectionLimit = DEFAULT_CONNECTION_LIMIT,
  log = [],
}) {
  const parsed = new URL(url);
  const adapter = new PrismaMariaDb({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    connectionLimit,
    timezone,
    // MySQL 9 authenticates with caching_sha2_password. Without TLS, the driver must fetch the server's
    // RSA key to send the password. Only enable this (?allowPublicKeyRetrieval=true) on trusted networks
    // such as local Docker; elsewhere connect over TLS.
    allowPublicKeyRetrieval: parsed.searchParams.get('allowPublicKeyRetrieval') === 'true',
  });
  return new PrismaClient({ adapter, log });
}
