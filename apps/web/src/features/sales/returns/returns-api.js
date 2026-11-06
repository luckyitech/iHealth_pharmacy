import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { resourceKey } from '@/lib/resource-api';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').returnableBillSchema>} ReturnableBill
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').completedReturnSchema>} CompletedReturn
 * @typedef {{ lineId: number, quantity: number, condition: string }} ReturnLine
 * @typedef {{ lines: ReturnLine[], reason: string, refund: string, mpesaCode?: string, approver: string, pin: string }} ReturnBody
 */

const BILLS = 'sales/bills';

/**
 * @param {number | null} billId
 * @returns {import('@tanstack/react-query').UseQueryResult<ReturnableBill>}
 */
export function useReturnableBill(billId) {
  return useQuery({
    queryKey: ['sales', 'bills', billId, 'returnable'],
    queryFn: async () =>
      /** @type {{ data: ReturnableBill }} */ (
        await api.get(`${BILLS}/${billId}/returnable`).json()
      ).data,
    enabled: billId !== null,
  });
}

/** @returns {import('@tanstack/react-query').UseMutationResult<CompletedReturn, Error, { billId: number } & ReturnBody>} */
export function useReturnGoods() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, ...body }) =>
      /** @type {{ data: CompletedReturn }} */ (
        await api.post(`${BILLS}/${billId}/returns`, { json: body }).json()
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: resourceKey(BILLS) });
      void queryClient.invalidateQueries({ queryKey: ['sales', 'bills'] });
    },
  });
}

/**
 * Opens a return's receipt (with its credit note) in a new tab.
 *
 * @param {number} returnId
 * @returns {Promise<void>}
 */
export async function openReturnReceipt(returnId) {
  // Opened before the request, so the browser does not treat it as an unrequested pop-up.
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await api.get(`sales/returns/${returnId}/receipt`).blob());
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
