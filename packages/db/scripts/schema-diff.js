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
const packageRoot = path.resolve(here, '..');
loadEnv({ path: path.resolve(packageRoot, '../../.env'), quiet: true });

const NO_DIFFERENCE = 0;
const HAS_DIFFERENCE = 2;

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
    'prisma/schema.prisma',
    '--script',
    '--exit-code',
  ],
  { cwd: packageRoot, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' },
);

if (result.status === NO_DIFFERENCE) {
  process.stdout.write('Prisma schema matches the reference database.\n');
} else if (result.status === HAS_DIFFERENCE) {
  process.stderr.write(
    'Prisma schema and reference database differ. SQL that would reconcile them (NOT applied):\n\n',
  );
  process.stderr.write(result.stdout);
  process.stderr.write(
    '\nRe-run `npm run db:pull -w @ihealth/db` against the reference database.\n',
  );
} else {
  process.stderr.write(result.stderr || result.stdout);
}
process.exit(result.status ?? 1);
