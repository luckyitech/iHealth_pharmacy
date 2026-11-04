import { MS_PER_MINUTE as MINUTE_MS } from '@ihealth/shared/units';
import { ERROR_CODES } from '@ihealth/shared/errors';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { AppError } from '../../lib/errors.js';

export const RATE_LIMITS = Object.freeze({
  // Generous: protects the API from runaway clients without getting in the way of a busy till.
  api: { windowMs: MINUTE_MS, limit: 600 },
  // Per IP, on top of the per-username lockout.
  login: { windowMs: 15 * MINUTE_MS, limit: 30 },
  approvalPin: { windowMs: 15 * MINUTE_MS, limit: 30 },
  passwordReset: { windowMs: 15 * MINUTE_MS, limit: 10 },
});

/**
 * @param {{ windowMs: number, limit: number }} options
 * @param {string} prefix
 * @param {import('ioredis').Redis | undefined} redis Shared counters across API instances; in memory when absent (tests).
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({ windowMs, limit }, prefix, redis) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(redis
      ? {
          store: new RedisStore({
            prefix: `rl:${prefix}:`,
            // @ts-expect-error ioredis' call() accepts the same variadic arguments rate-limit-redis passes
            sendCommand: (command, ...args) => redis.call(command, ...args),
          }),
        }
      : {}),
    handler: (_req, _res, next, options) => {
      next(
        new AppError(ERROR_CODES.RATE_LIMITED, {
          headers: { 'Retry-After': String(Math.ceil(options.windowMs / 1000)) },
        }),
      );
    },
  });
}
