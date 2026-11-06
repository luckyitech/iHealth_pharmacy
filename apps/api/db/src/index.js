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
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/**
 * The database keeps times as the pharmacy's wall clock (the legacy app and MySQL's NOW() both do),
 * but Prisma reads and writes dates as UTC. This is how far the two are apart.
 */
let wallClockOffsetMs = 0;

/**
 * @param {string} timezone e.g. `+03:00`
 * @returns {number} The offset in milliseconds.
 */
function offsetOf(timezone) {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(timezone);
  if (!match) return 0;
  const minutes = Number(match[2]) * MINUTES_PER_HOUR + Number(match[3]);
  return (match[1] === '-' ? -minutes : minutes) * MS_PER_MINUTE;
}

/**
 * A time to write to a date-time column, so the column holds the pharmacy's wall clock, as the
 * legacy app writes it.
 *
 * @param {Date} [instant]
 * @returns {Date}
 */
export function toDbTime(instant = new Date()) {
  return new Date(instant.getTime() + wallClockOffsetMs);
}

/**
 * The real moment of a date-time read from the database (which holds the pharmacy's wall clock).
 *
 * @param {Date | string} value As Prisma returns it.
 * @returns {Date}
 */
export function fromDbTime(value) {
  return new Date(new Date(value).getTime() - wallClockOffsetMs);
}

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
  wallClockOffsetMs = offsetOf(timezone);
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
