import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPrismaClient } from '@ihealth/db';
import { MySqlContainer } from '@testcontainers/mysql';
import { RedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlRoot = path.resolve(here, '../../../../packages/db/sql');
const ROOT_PASSWORD = 'integration-only';
const DATABASE = 'ihealthpharm_test';

/**
 * @param {string} folder
 * @returns {string[]}
 */
const sqlFiles = (folder) =>
  readdirSync(path.join(sqlRoot, folder))
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => path.join(sqlRoot, folder, file));

/**
 * Starts MySQL 9.7.1 and Redis, then loads the committed legacy schema, the additive tables and the
 * synthetic seed: the same steps as scripts/db/load-test-db.sh, without any real data.
 */
export async function startTestDatabase() {
  const files = [...sqlFiles('schema'), ...sqlFiles('additive'), ...sqlFiles('seed')];
  const [mysql, redisContainer] = await Promise.all([
    new MySqlContainer('mysql:9.7.1')
      .withDatabase(DATABASE)
      .withRootPassword(ROOT_PASSWORD)
      .withCommand([
        '--lower-case-table-names=1',
        '--log-bin-trust-function-creators=1',
        '--default-time-zone=+03:00',
      ])
      .withCopyFilesToContainer(
        files.map((source, index) => ({
          source,
          target: `/sql/${String(index).padStart(2, '0')}.sql`,
        })),
      )
      .start(),
    new RedisContainer('redis:8.6-alpine').start(),
  ]);

  for (let index = 0; index < files.length; index += 1) {
    const result = await mysql.exec([
      'sh',
      '-c',
      `mysql -uroot -p"${ROOT_PASSWORD}" ${DATABASE} < /sql/${String(index).padStart(2, '0')}.sql`,
    ]);
    if (result.exitCode !== 0) throw new Error(`Loading ${files[index]} failed: ${result.output}`);
  }

  const url = `mysql://root:${ROOT_PASSWORD}@${mysql.getHost()}:${mysql.getPort()}/${DATABASE}?allowPublicKeyRetrieval=true`;
  const prisma = createPrismaClient({ url });
  const redis = new Redis(redisContainer.getConnectionUrl());

  return {
    prisma,
    redis,
    url,
    /** Raw SELECT for assertions; rows are untyped on purpose. */
    select: /** @type {(sql: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>} */ (
      (sql, ...values) => prisma.$queryRaw(sql, ...values)
    ),
    async stop() {
      await prisma.$disconnect();
      redis.disconnect();
      await Promise.all([mysql.stop(), redisContainer.stop()]);
    },
  };
}
