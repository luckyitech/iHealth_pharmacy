import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').tillCustomerSchema>} CustomerOption
 */

/**
 * Registered customers whose name or phone matches, for the customer type-ahead.
 *
 * @param {string} q At least two characters.
 * @param {boolean} enabled
 * @returns {import('@tanstack/react-query').UseQueryResult<CustomerOption[]>}
 */
export function useCustomerSearch(q, enabled) {
  return useQuery({
    queryKey: ['sales', 'customers', q],
    queryFn: async () =>
      /** @type {{ data: CustomerOption[] }} */ (
        await api.get('sales/customers', { searchParams: { q } }).json()
      ).data,
    enabled,
    placeholderData: keepPreviousData,
  });
}
