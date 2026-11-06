import { formatMoney } from '@ihealth/shared/money';
import { useMemo } from 'react';

import { useAppInfo } from '@/app/use-app-info';

/**
 * @param {string | null} value Legacy date or date-time text, `YYYY-MM-DD[ HH:MM[:SS]]`, already in
 *   the pharmacy's local time.
 * @returns {Date | null} The same wall-clock time, held in UTC so formatting never shifts it.
 */
function wallClock(value) {
  if (!value) return null;
  const [date, time = ''] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/** Formatting already-local legacy times must not convert them again. */
const NO_SHIFT = 'UTC'; // hardcode-ok: the values are local wall-clock times, see wallClock()

/**
 * Money, dates and times in this installation's locale and currency (from GET /app-info).
 *
 * @returns {{ money: (value: string | number) => string, date: (value: string | null) => string, dateTime: (value: string | null) => string, time: (instant: string) => string, instant: (instant: string) => string }}
 */
export function useFormat() {
  const { data } = useAppInfo();
  const region = data?.region;
  return useMemo(() => {
    const locale = region?.locale;
    const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: NO_SHIFT });
    const dateTimeFormat = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: NO_SHIFT,
    });
    // Instants (ISO with a zone, from the new tables) are shown in the pharmacy's time zone.
    const timeFormat = new Intl.DateTimeFormat(locale, {
      timeStyle: 'short',
      timeZone: region?.timeZone,
    });
    const instantFormat = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: region?.timeZone,
    });
    return {
      money: (value) => (region ? formatMoney(value, region) : String(value)),
      date: (value) => {
        const parsed = wallClock(value);
        return parsed ? dateFormat.format(parsed) : '—';
      },
      dateTime: (value) => {
        const parsed = wallClock(value);
        if (!parsed) return '—';
        return value?.includes(' ') ? dateTimeFormat.format(parsed) : dateFormat.format(parsed);
      },
      time: (instant) => timeFormat.format(new Date(instant)),
      instant: (instant) => instantFormat.format(new Date(instant)),
    };
  }, [region]);
}

const WALL_CLOCK_LOCALE = 'sv-SE'; // hardcode-ok: a locale that formats as YYYY-MM-DD HH:MM:SS, used only to build text

/**
 * @param {string | undefined} timeZone The pharmacy's time zone.
 * @returns {string} Now on the pharmacy's wall clock, `YYYY-MM-DD HH:MM:SS`, like legacy times.
 */
export function wallClockNow(timeZone) {
  return new Intl.DateTimeFormat(WALL_CLOCK_LOCALE, {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone,
  }).format(new Date());
}

/**
 * @param {string | null} later Wall-clock text, `YYYY-MM-DD HH:MM[:SS]`.
 * @param {string | null} earlier
 * @returns {number | null} Whole minutes between them, or null when either is missing.
 */
export function minutesBetween(later, earlier) {
  const a = wallClock(later);
  const b = wallClock(earlier);
  return a && b ? Math.floor((a.getTime() - b.getTime()) / 60_000) : null;
}
