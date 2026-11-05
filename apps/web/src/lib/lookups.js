import { useQuery } from '@tanstack/react-query';

import { api } from './api-client.js';

/** @typedef {{ id: number, name: string }} Option */

/** Reference lists rarely change during a session. */
const LOOKUP_STALE_MS = 60 * 60 * 1000;

/**
 * A read-only reference list from `/lookups/<path>`.
 *
 * @param {string} path e.g. `countries`
 * @returns {import('@tanstack/react-query').UseQueryResult<Option[]>}
 */
function useLookup(path) {
  return useQuery({
    queryKey: ['lookups', path],
    queryFn: async () =>
      /** @type {{ data: Option[] }} */ (await api.get(`lookups/${path}`).json()).data,
    staleTime: LOOKUP_STALE_MS,
  });
}

export const useCountries = () => useLookup('countries');
export const useProviderTypes = () => useLookup('provider-types');
export const useTaxCategories = () => useLookup('tax-categories');
export const useScheduleCodes = () => useLookup('schedule-codes');
export const useLatinCodes = () => useLookup('latin-codes');
export const usePaymentTypes = () => useLookup('payment-types');
export const useReturnCreditTypes = () => useLookup('return-credit-types');

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
