import { useQuery } from '@tanstack/react-query';

import { api } from './api-client.js';

/** @typedef {{ id: number, name: string }} Option */

/** Reference lists rarely change during a session. */
const LOOKUP_STALE_MS = 60 * 60 * 1000;

/**
 * @returns {import('@tanstack/react-query').UseQueryResult<Option[]>}
 */
export function useCountries() {
  return useQuery({
    queryKey: ['lookups', 'countries'],
    queryFn: async () =>
      /** @type {{ data: Option[] }} */ (await api.get('lookups/countries').json()).data,
    staleTime: LOOKUP_STALE_MS,
  });
}

/**
 * @param {number | null | undefined} countryId
 * @returns {import('@tanstack/react-query').UseQueryResult<Option[]>}
 */
export function useProvinces(countryId) {
  return useQuery({
    queryKey: ['lookups', 'provinces', countryId],
    queryFn: async () =>
      /** @type {{ data: Option[] }} */ (
        await api
          .get('lookups/provinces', { searchParams: { countryId: String(countryId) } })
          .json()
      ).data,
    enabled: Boolean(countryId),
    staleTime: LOOKUP_STALE_MS,
  });
}

/**
 * @returns {import('@tanstack/react-query').UseQueryResult<Option[]>}
 */
export function useProviderTypes() {
  return useQuery({
    queryKey: ['lookups', 'provider-types'],
    queryFn: async () =>
      /** @type {{ data: Option[] }} */ (await api.get('lookups/provider-types').json()).data,
    staleTime: LOOKUP_STALE_MS,
  });
}
