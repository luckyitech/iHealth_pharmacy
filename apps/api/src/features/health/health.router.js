import { Router } from 'express';

const CHECK_TIMEOUT_MS = 2_000;
const STATUS_OK = 'ok';
const STATUS_ERROR = 'error';

/**
 * @param {() => Promise<unknown>} check
 * @returns {Promise<'ok' | 'error'>}
 */
async function probe(check) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    return STATUS_OK;
  } catch {
    return STATUS_ERROR;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Liveness: the process is up. Readiness: the database and Redis answer, so the API can serve traffic.
 * They are kept outside /api/v1 and do not need authentication.
 *
 * @param {{ prisma: { $queryRaw: (query: TemplateStringsArray) => Promise<unknown> }, redis: { ping: () => Promise<unknown> } }} deps
 * @returns {import('express').Router}
 */
export function createHealthRouter({ prisma, redis }) {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.json({ status: STATUS_OK });
  });

  router.get('/ready', async (_req, res) => {
    const [database, cache] = await Promise.all([
      probe(() => prisma.$queryRaw`SELECT 1`),
      probe(() => redis.ping()),
    ]);
    const ready = database === STATUS_OK && cache === STATUS_OK;
    res.status(ready ? 200 : 503).json({
      status: ready ? STATUS_OK : STATUS_ERROR,
      checks: { database, redis: cache },
    });
  });

  return router;
}
