/**
 * Fails when prisma/schema.prisma no longer matches the reference database schema.
 * Read-only: `prisma migrate diff` compares the two and prints the SQL that would reconcile them.
 * Nothing is ever applied.
 *
 *   node scripts/schema-diff.js            # compares against TEST_DATABASE_URL (falls back to DATABASE_URL)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// Prisma runs from apps/api, where prisma.config.js is.
const apiRoot = path.resolve(here, '../..');
loadEnv({ path: path.resolve(apiRoot, '../../.env'), quiet: true });

const NO_DIFFERENCE = 0;
const HAS_DIFFERENCE = 2;
// Additive tables of the new system (apps/api/db/sql/additive) are not part of the legacy schema.
const ADDITIVE_TABLE = /`ih_\w+`/;

/**
 * Drops the statements that only concern additive tables from the diff script.
 *
 * @param {string} script
 * @returns {string}
 */
function withoutAdditiveTables(script) {
  return script
    .split(/\n(?=-- )/)
    .filter((statement) => !ADDITIVE_TABLE.test(statement))
    .join('\n')
    .trim();
}

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('Set TEST_DATABASE_URL (or DATABASE_URL) to the reference database.\n');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  [
    'prisma',
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    'db/prisma/schema.prisma',
    '--script',
    '--exit-code',
  ],
  { cwd: apiRoot, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' },
);

const remaining = result.status === HAS_DIFFERENCE ? withoutAdditiveTables(result.stdout) : '';

if (result.status === NO_DIFFERENCE || (result.status === HAS_DIFFERENCE && remaining === '')) {
  process.stdout.write(
    'Prisma schema matches the reference database (additive ih_* tables excluded).\n',
  );
  process.exit(NO_DIFFERENCE);
} else if (result.status === HAS_DIFFERENCE) {
  process.stderr.write(
    'Prisma schema and reference database differ. SQL that would reconcile them (NOT applied):\n\n',
  );
  process.stderr.write(result.stdout);
  process.stderr.write(
    '\nRe-run `npm run db:pull -w @ihealth/api` against the reference database.\n',
  );
} else {
  process.stderr.write(result.stderr || result.stdout);
}
process.exit(result.status ?? 1);
