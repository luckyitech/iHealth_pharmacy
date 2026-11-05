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
 * @returns {{ money: (value: string | number) => string, date: (value: string | null) => string, dateTime: (value: string | null) => string }}
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
    };
  }, [region]);
}
