import { AppError } from '../../lib/errors.js';
import { ERROR_CODES } from '@ihealth/shared/errors';

/** Counter names in the legacy `generateuniquecode` table, by document kind. */
export const DOCUMENT_KINDS = Object.freeze({ EMPLOYEE: 'EM', SALE: 'SB' });

/**
 * Only the numeric day, month and year parts are read, so the locale affects nothing but the
 * digits used; this one gives plain 0-9.
 */
const DIGITS_LOCALE = 'en-GB'; // hardcode-ok: formatting detail, not a regional setting

/** The counter is zero-padded to this many digits, as in the legacy codes. */
const COUNTER_DIGITS = 4;

/**
 * @param {Date} date
 * @param {string} timeZone
 * @returns {string} The date as `ddMMyy` in the pharmacy's time zone.
 */
function dayStamp(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat(DIGITS_LOCALE, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}${parts.month}${parts.year}`;
}

/**
 * The next code of a kind, in the legacy house format: prefix + kind + `ddMMyy` + a 4-digit number,
 * e.g. `DPEM0411260001`. The number comes from `generateuniquecode`, which a nightly database
 * event resets; the date keeps codes unique across days.
 *
 * The counter moves with one UPDATE, so the row stays locked until the transaction ends and two
 * people saving at the same moment get different numbers (the legacy app read, added and saved).
 *
 * @param {import('#db').Prisma.TransactionClient} tx Must be a transaction.
 * @param {string} kind One of DOCUMENT_KINDS.
 * @param {{ prefix: string, timeZone: string, now?: Date }} options
 * @returns {Promise<string>}
 */
export async function nextDocumentCode(tx, kind, { prefix, timeZone, now = new Date() }) {
  const updated = await tx.$executeRaw`
    UPDATE generateuniquecode
    SET UNIQUE_CODE_NUMBER = UNIQUE_CODE_NUMBER + 1, LAST_UPDATE_TS = NOW()
    WHERE UNIQUE_CODE_NAME = ${kind}`;
  if (updated === 0) {
    // A missing counter row must not produce a number nobody reserved.
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, {
      message: `No number sequence for ${kind} codes`,
    });
  }
  /** @type {{ value: number }[]} */
  const [row] = await tx.$queryRaw`
    SELECT UNIQUE_CODE_NUMBER AS value FROM generateuniquecode WHERE UNIQUE_CODE_NAME = ${kind}`;
  return `${prefix}${kind}${dayStamp(now, timeZone)}${String(row.value).padStart(COUNTER_DIGITS, '0')}`;
}
