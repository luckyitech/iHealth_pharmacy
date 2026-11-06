import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';

/** @typedef {import('@ihealth/shared/schemas').ActivityEntry} ActivityEntry */

/** Every History list is cached under this key, so a change anywhere can refresh them all. */
export const HISTORY_KEY = 'history';

/**
 * A History list from the API (`.../history`).
 *
 * @param {string} path e.g. `sales/bills/12/history`
 * @param {{ enabled?: boolean }} [options]
 * @returns {import('@tanstack/react-query').UseQueryResult<ActivityEntry[]>}
 */
export function useHistory(path, { enabled = true } = {}) {
  return useQuery({
    queryKey: [HISTORY_KEY, path],
    queryFn: async () => /** @type {{ data: ActivityEntry[] }} */ (await api.get(path).json()).data,
    enabled,
  });
}
