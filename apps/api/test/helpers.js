import pino from 'pino';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

export const TEST_SECRET = 'test-secret-that-is-long-enough-0123456789';

/** @type {NodeJS.ProcessEnv} */
export const TEST_ENV = Object.freeze({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
  DATABASE_URL: 'mysql://user:pass@localhost:3307/ihealthpharm_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: TEST_SECRET,
  JWT_REFRESH_SECRET: `${TEST_SECRET}-refresh`,
  CSRF_SECRET: `${TEST_SECRET}-csrf`,
});

/**
 * Builds the app with in-memory fakes for the database and Redis.
 *
 * @param {Partial<import('../src/app.js').AppDependencies>} [overrides]
 * @returns {import('express').Express}
 */
export function buildTestApp(overrides = {}) {
  const fakePrisma = /** @type {import('@ihealth/db').PrismaClient} */ (
    /** @type {unknown} */ ({ $queryRaw: async () => [{ 1: 1 }] })
  );
  return createApp({
    config: overrides.config ?? loadConfig(TEST_ENV),
    logger: pino({ level: 'silent' }),
    prisma: fakePrisma,
    redis: { ping: async () => 'PONG' },
    ...overrides,
  });
}
