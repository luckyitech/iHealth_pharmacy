import { useEffect, useState } from 'react';

const DEFAULT_DELAY_MS = 300;

/**
 * @template T
 * @param {T} value
 * @param {number} [delayMs]
 * @returns {T} `value`, once it has stopped changing for `delayMs`.
 */
export function useDebouncedValue(value, delayMs = DEFAULT_DELAY_MS) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
