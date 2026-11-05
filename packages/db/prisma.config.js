import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../.env'), quiet: true });

// Prisma Migrate is never used here: the legacy schema is owned by the legacy system (ADR 0003).
// The CLI is only used for `db pull`, `generate` and the read-only `migrate diff` check.
// `prisma generate` (the build) needs no database, so the datasource is only set when a URL is present.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join(here, 'prisma/schema.prisma'),
  ...(url ? { datasource: { url } } : {}),
});
