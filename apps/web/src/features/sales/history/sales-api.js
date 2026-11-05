import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { resourceKey } from '@/lib/resource-api';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').billSummarySchema>} BillSummary
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').billDetailSchema>} BillDetail
 */

export const BILLS = 'sales/bills';

/**
 * One bill with its lines, payments and audit details.
 *
 * @param {number | undefined} id
 * @returns {import('@tanstack/react-query').UseQueryResult<BillDetail>}
 */
export function useBill(id) {
  return useQuery({
    queryKey: [...resourceKey(BILLS), 'one', id],
    queryFn: async () =>
      /** @type {{ data: BillDetail }} */ (await api.get(`${BILLS}/${id}`).json()).data,
    enabled: id !== undefined,
  });
}

/**
 * The people who have made bills, for the cashier filter.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<{ id: number, name: string }[]>}
 */
export function useCashiers() {
  return useQuery({
    queryKey: ['sales', 'cashiers'],
    queryFn: async () =>
      /** @type {{ data: { id: number, name: string }[] }} */ (
        await api.get('sales/cashiers').json()
      ).data,
    staleTime: Infinity,
  });
}

/**
 * Fetches a bill's receipt and opens it in a new tab for printing. The PDF comes through the API
 * client, so the session cookie and the usual error handling apply.
 *
 * @param {number} id
 * @param {{ original?: boolean }} [options] `original` right after the sale; the server gives it once.
 * @returns {Promise<void>}
 */
export async function openReceipt(id, { original = false } = {}) {
  // Opened before the request, so the browser does not treat it as an unrequested pop-up.
  const tab = window.open('', '_blank');
  try {
    const blob = await api
      .get(`${BILLS}/${id}/receipt`, original ? { searchParams: { original: 'true' } } : {})
      .blob();
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
