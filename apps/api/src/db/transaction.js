/** @typedef {import('#db').PrismaClient} PrismaClient */
/** @typedef {Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>} TransactionClient */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_WAIT_MS = 5_000;

/**
 * Runs `work` in one database transaction: every write inside commits together or not at all.
 * Use it for any service operation that writes more than one row.
 *
 * @template T
 * @param {PrismaClient} prisma
 * @param {(tx: TransactionClient) => Promise<T>} work
 * @param {{ timeoutMs?: number, maxWaitMs?: number, isolationLevel?: import('#db').Prisma.TransactionIsolationLevel }} [options]
 * @returns {Promise<T>}
 */
export function withTransaction(prisma, work, options = {}) {
  return prisma.$transaction(work, {
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxWait: options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
    ...(options.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
  });
}
