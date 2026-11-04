import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';

export const APP_INFO_KEY = /** @type {const} */ (['app-info']);

/**
 * @typedef {object} AppInfo
 * @property {string} apiVersion
 * @property {{ id: number, name: string, city: string | null, country: string | null } | null} pharmacy
 * @property {{ locale: string, currency: string, timeZone: string }} region
 */

/**
 * Pharmacy and regional settings of this installation. They rarely change, so they are fetched once.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<AppInfo>}
 */
export function useAppInfo() {
  return useQuery({
    queryKey: APP_INFO_KEY,
    queryFn: async () => {
      /** @type {{ data: AppInfo }} */
      const body = await api.get('app-info').json();
      return body.data;
    },
    staleTime: Infinity,
  });
}
