import { z } from 'zod';

const MIN_SECRET_LENGTH = 32;

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const secret = z
  .string()
  .min(MIN_SECRET_LENGTH, `must be at least ${MIN_SECRET_LENGTH} characters`);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url())),
  DATABASE_URL: z.string().startsWith('mysql://', 'must be a mysql:// URL'),
  REDIS_URL: z.string().startsWith('redis://', 'must be a redis:// URL'),
  JWT_ACCESS_SECRET: secret,
  JWT_REFRESH_SECRET: secret,
  CSRF_SECRET: secret,
  COOKIE_SECURE: booleanString,
  // Public address of the web app, used in links sent by email.
  APP_URL: z.url().default('http://localhost:5180'),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: booleanString,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().min(3).default('iHealth Pharmacy <no-reply@ihealth.local>'),
});

/**
 * @typedef {object} Config
 * @property {'development' | 'test' | 'production'} env
 * @property {boolean} isProduction
 * @property {number} port
 * @property {string} logLevel
 * @property {string[]} corsOrigins
 * @property {string} databaseUrl
 * @property {string} redisUrl
 * @property {{ accessSecret: string, refreshSecret: string, csrfSecret: string, cookieSecure: boolean }} auth
 * @property {string} appUrl
 * @property {{ host: string, port: number, secure: boolean, user?: string, pass?: string, from: string }} mail
 */

/**
 * Validates environment variables once at startup. Throws with every problem listed, so a
 * misconfigured deployment fails loudly instead of running with a bad setting.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {Readonly<Config>}
 */
export function loadConfig(env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid configuration:\n${problems.join('\n')}`);
  }
  const values = result.data;
  if (values.NODE_ENV === 'production' && !values.COOKIE_SECURE) {
    throw new Error('Invalid configuration:\n  - COOKIE_SECURE: must be true in production');
  }
  return Object.freeze({
    env: values.NODE_ENV,
    isProduction: values.NODE_ENV === 'production',
    port: values.API_PORT,
    logLevel: values.LOG_LEVEL,
    corsOrigins: values.CORS_ORIGINS,
    databaseUrl: values.DATABASE_URL,
    redisUrl: values.REDIS_URL,
    auth: Object.freeze({
      accessSecret: values.JWT_ACCESS_SECRET,
      refreshSecret: values.JWT_REFRESH_SECRET,
      csrfSecret: values.CSRF_SECRET,
      cookieSecure: values.COOKIE_SECURE,
    }),
    appUrl: values.APP_URL.replace(/\/$/, ''),
    mail: Object.freeze({
      host: values.SMTP_HOST,
      port: values.SMTP_PORT,
      secure: values.SMTP_SECURE,
      user: values.SMTP_USER || undefined,
      pass: values.SMTP_PASS || undefined,
      from: values.MAIL_FROM,
    }),
  });
}
