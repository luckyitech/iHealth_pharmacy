import { QueryClient } from '@tanstack/react-query';

import { isApiError } from './api-error.js';

const STALE_TIME_MS = 30_000;
const MAX_QUERY_RETRIES = 2;

/**
 * Client errors (4xx) will not fix themselves, so only network and server errors are retried.
 *
 * @param {number} failureCount
 * @param {unknown} error
 * @returns {boolean}
 */
function shouldRetry(failureCount, error) {
  if (isApiError(error) && error.status < 500) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

/**
 * @returns {QueryClient}
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: STALE_TIME_MS, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
