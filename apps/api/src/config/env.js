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
  // Which pharmacy record this installation presents (sign-in page, emails). Empty = the first active one.
  PHARMACY_ID: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  // First letters of every generated document code (legacy "DP": DPEM0411260001).
  DOCUMENT_CODE_PREFIX: z
    .string()
    .regex(/^[A-Z]{1,4}$/, 'must be 1 to 4 capital letters')
    .default('DP'),
  // A bill's net is rounded to this step (legacy: whole shillings). 0 keeps cents.
  SALES_ROUNDING_STEP: z.coerce.number().min(0).max(100).default(1),
  // Highest line discount a cashier may give without a second person's approval, in percent.
  SALES_SELF_DISCOUNT_LIMIT: z.coerce.number().min(0).max(100).default(25),
  // Prescriber saved on bills without one, as the legacy app did (its "N/A" provider). Empty = none.
  SALES_DEFAULT_PROVIDER_ID: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  // Most sales one pharmacy can keep on hold at once; each till parks a sale while serving the next.
  SALES_MAX_HELD: z.coerce.number().int().min(1).max(500).default(30),
  // Cheques dated longer ago than this many months are refused: banks no longer pay them.
  SALES_CHEQUE_MAX_AGE_MONTHS: z.coerce.number().int().min(1).max(24).default(6),
  // Printed in quotes under the receipt's totals, as the legacy receipt did. Empty prints nothing.
  RECEIPT_RETURN_NOTE: z.string().default('GOODS ONCE SOLD CANNOT BE RETURNED'),
  // Tax codes printed as "Exempt" instead of a rate on the receipt (comma-separated).
  RECEIPT_EXEMPT_TAX_CODES: z
    .string()
    .default('E')
    .transform((value) =>
      value
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  // Minutes after a sale during which its cashier may cancel it alone (with a reason).
  SALES_CANCEL_ALONE_MINUTES: z.coerce.number().int().min(0).max(1440).default(10),
  // Wrong approval PINs allowed before the approver is locked out, and for how long.
  SALES_APPROVAL_PIN_TRIES: z.coerce.number().int().min(1).max(20).default(3),
  SALES_APPROVAL_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  // How long an approval given at the till stays usable for completing that sale.
  SALES_APPROVAL_VALID_MINUTES: z.coerce.number().int().min(1).max(240).default(15),
  // Quick reasons offered in the approval window (comma-separated).
  SALES_APPROVAL_REASONS: z
    .string()
    .default('Regular customer,Price match,Near expiry,Staff purchase')
    .transform((value) =>
      value
        .split(',')
        .map((reason) => reason.trim())
        .filter(Boolean),
    ),
  // Bank notes offered as quick amounts in the payment window, smallest first.
  SALES_QUICK_CASH_NOTES: z
    .string()
    .default('50,100,200,500,1000')
    .transform((value) => value.split(',').map((note) => Number(note.trim())))
    .pipe(z.array(z.number().positive()).min(1)),
  // Most batches one till search returns.
  SALES_SEARCH_LIMIT: z.coerce.number().int().min(5).max(100).default(30),
  // Regional settings. The legacy database has no table for them, so they are deployment configuration.
  APP_LOCALE: z.string().min(2).default('en-KE'),
  APP_CURRENCY: z.string().length(3).default('KES'),
  APP_TIME_ZONE: z.string().min(1).default('Africa/Nairobi'),
  // Offset the legacy data is stored in (MySQL session time zone).
  DB_TIME_ZONE: z
    .string()
    .regex(/^[+-]\d{2}:\d{2}$/, 'must look like +03:00')
    .default('+03:00'),
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
 * @property {number | undefined} pharmacyId
 * @property {string} documentCodePrefix
 * @property {{ roundingStep: number, selfDiscountLimit: number, defaultProviderId: number | undefined, maxHeld: number, searchLimit: number, quickCashNotes: number[], chequeMaxAgeMonths: number, cancelAloneMinutes: number, approvalPinTries: number, approvalLockMinutes: number, approvalValidMinutes: number, approvalReasons: string[] }} sales
 * @property {{ returnNote: string | null, exemptTaxCodes: string[] }} receipt
 * @property {{ locale: string, currency: string, timeZone: string, dbTimeZone: string }} region
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
    pharmacyId: values.PHARMACY_ID,
    documentCodePrefix: values.DOCUMENT_CODE_PREFIX,
    receipt: Object.freeze({
      returnNote: values.RECEIPT_RETURN_NOTE.trim() || null,
      exemptTaxCodes: values.RECEIPT_EXEMPT_TAX_CODES,
    }),
    sales: Object.freeze({
      roundingStep: values.SALES_ROUNDING_STEP,
      selfDiscountLimit: values.SALES_SELF_DISCOUNT_LIMIT,
      defaultProviderId: values.SALES_DEFAULT_PROVIDER_ID,
      maxHeld: values.SALES_MAX_HELD,
      searchLimit: values.SALES_SEARCH_LIMIT,
      quickCashNotes: values.SALES_QUICK_CASH_NOTES,
      chequeMaxAgeMonths: values.SALES_CHEQUE_MAX_AGE_MONTHS,
      cancelAloneMinutes: values.SALES_CANCEL_ALONE_MINUTES,
      approvalPinTries: values.SALES_APPROVAL_PIN_TRIES,
      approvalLockMinutes: values.SALES_APPROVAL_LOCK_MINUTES,
      approvalValidMinutes: values.SALES_APPROVAL_VALID_MINUTES,
      approvalReasons: values.SALES_APPROVAL_REASONS,
    }),
    region: Object.freeze({
      locale: values.APP_LOCALE,
      currency: values.APP_CURRENCY,
      timeZone: values.APP_TIME_ZONE,
      dbTimeZone: values.DB_TIME_ZONE,
    }),
  });
}
