import { describe, expect, it } from 'vitest';

import { paginate, toOrderBy, toPagination } from '../src/db/list-query.js';
import { withTransaction } from '../src/db/transaction.js';

describe('list query helpers', () => {
  it('converts page and size to skip and take', () => {
    expect(toPagination({ page: 3, pageSize: 25 })).toEqual({ skip: 50, take: 25 });
  });

  it('maps public sort fields to Prisma fields', () => {
    expect(toOrderBy({ field: 'name', direction: 'desc' }, { name: 'firstNm' })).toEqual({
      firstNm: 'desc',
    });
  });

  it('builds the list envelope', async () => {
    const result = await paginate(
      { page: 2, pageSize: 2 },
      { count: async () => 5, findMany: async ({ skip, take }) => [skip, take] },
    );
    expect(result).toEqual({
      data: [2, 2],
      meta: { page: 2, pageSize: 2, total: 5, totalPages: 3 },
    });
  });
});

describe('withTransaction', () => {
  it('passes the work and default limits to Prisma', async () => {
    /** @type {unknown[]} */
    const calls = [];
    const prisma = /** @type {import('#db').PrismaClient} */ (
      /** @type {unknown} */ ({
        $transaction: async (
          /** @type {(tx: string) => unknown} */ work,
          /** @type {unknown} */ options,
        ) => {
          calls.push(options);
          return work('tx');
        },
      })
    );
    const result = await withTransaction(prisma, async (tx) => `ran in ${String(tx)}`);
    expect(result).toBe('ran in tx');
    expect(calls).toEqual([{ timeout: 10_000, maxWait: 5_000 }]);
  });
});
