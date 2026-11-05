import { createAuditLog } from '../audit/audit-log.js';
import { createAuthGuards } from './auth.guards.js';
import { createAuthRepository } from './auth.repository.js';
import { createAuthRoutes } from './auth.routes.js';
import { createAuthService } from './auth.service.js';
import { createCsrf } from './csrf.js';
import { createLoginThrottle } from './login-throttle.js';
import { createRateLimiter, RATE_LIMITS } from './rate-limits.js';
import { createAccessTokens } from './tokens.js';

/**
 * Wires the auth feature: its routes, the guards every other route uses, and the global API rate limit.
 *
 * @param {object} deps
 * @param {Readonly<import('../../config/env.js').Config>} deps.config
 * @param {import('@ihealth/db').PrismaClient} deps.prisma
 * @param {import('./login-throttle.js').CounterStore} deps.counters Redis in production, a fake in tests.
 * @param {import('ioredis').Redis} [deps.redis] Shared rate-limit counters; in memory when absent.
 * @param {import('pino').Logger} deps.logger
 * @param {import('../../infra/mailer.js').Mailer} deps.mailer
 * @param {import('./auth.repository.js').AuthRepository} [deps.repository] Replaced by an in-memory fake in tests.
 * @returns `{ routes, guards, apiRateLimit }`.
 */
export function createAuthModule({
  config,
  prisma,
  counters,
  redis,
  logger,
  mailer,
  repository = createAuthRepository(prisma),
}) {
  const audit = createAuditLog(prisma, logger);
  const accessTokens = createAccessTokens(config.auth.accessSecret);
  const csrf = createCsrf({
    secret: config.auth.csrfSecret,
    secureCookies: config.auth.cookieSecure,
  });
  const service = createAuthService({
    repository,
    accessTokens,
    loginThrottle: createLoginThrottle(counters, 'auth:login'),
    pinThrottle: createLoginThrottle(counters, 'auth:pin'),
    resetThrottle: createLoginThrottle(counters, 'auth:reset'),
    mailer,
    appUrl: config.appUrl,
    audit,
    logger,
  });

  return {
    routes: createAuthRoutes({
      service,
      csrf,
      secureCookies: config.auth.cookieSecure,
      limiters: {
        login: createRateLimiter(RATE_LIMITS.login, 'login', redis),
        approvalPin: createRateLimiter(RATE_LIMITS.approvalPin, 'pin', redis),
        passwordReset: createRateLimiter(RATE_LIMITS.passwordReset, 'reset', redis),
      },
    }),
    guards: createAuthGuards({ accessTokens, repository, csrf, audit }),
    apiRateLimit: createRateLimiter(RATE_LIMITS.api, 'api', redis),
  };
}
