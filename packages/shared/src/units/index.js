/** Unit conversions, named so durations and sizes read as what they are. */

export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
export const MINUTES_PER_HOUR = 60;
export const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;

export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;

/** Length of a calendar date as `YYYY-MM-DD`. */
const ISO_DATE_LENGTH = 10;

/**
 * Today's calendar date in the time zone of the device running the code.
 *
 * @param {Date} [now]
 * @returns {string} `YYYY-MM-DD`
 */
export function localToday(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * MS_PER_MINUTE);
  return local.toISOString().slice(0, ISO_DATE_LENGTH);
}
