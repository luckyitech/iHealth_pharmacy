import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ADDITIVE_DIR = fileURLToPath(new URL('../sql/additive/', import.meta.url));
const CREATE_TABLE = /CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/gi;

/**
 * The tables the additive SQL files create (read from the files, so this list never drifts).
 *
 * @returns {Promise<string[]>}
 */
export async function additiveTables() {
  const files = (await readdir(ADDITIVE_DIR)).filter((file) => file.endsWith('.sql')).sort();
  const tables = [];
  for (const file of files) {
    const sql = await readFile(`${ADDITIVE_DIR}${file}`, 'utf8');
    for (const match of sql.matchAll(CREATE_TABLE)) tables.push(match[1].toLowerCase());
  }
  return tables;
}

/**
 * Additive tables missing from the connected database: after pulling a change that adds one, the
 * API would otherwise fail on the first request that uses it.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<string[]>}
 */
export async function missingAdditiveTables(prisma) {
  const expected = await additiveTables();
  /** @type {{ name: string }[]} */
  const rows = await prisma.$queryRaw`
    SELECT LOWER(TABLE_NAME) AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
  const present = new Set(rows.map((row) => row.name));
  return expected.filter((table) => !present.has(table));
}
