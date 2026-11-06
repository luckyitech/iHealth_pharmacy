import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { resourceKey } from '@/lib/resource-api';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').returnableBillSchema>} ReturnableBill
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').completedReturnSchema>} CompletedReturn
 * @typedef {{ lineId: number, quantity: number, condition: string }} ReturnLine
 * @typedef {{ lines: ReturnLine[], reason: string, refund: string, mpesaCode?: string, approver: string, pin: string }} ReturnBody
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').returnSummarySchema>} ReturnSummary
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').creditNoteSummarySchema>} CreditNoteSummary
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').creditNoteUseSchema>} CreditNoteUse
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

/**
 * @param {string} date `YYYY-MM-DD`
 * @returns {import('@tanstack/react-query').UseQueryResult<ReturnSummary[]>}
 */
export function useReturnsOfDay(date) {
  return useQuery({
    queryKey: ['sales', 'returns', date],
    queryFn: async () =>
      /** @type {{ data: ReturnSummary[] }} */ (
        await api.get('sales/returns', { searchParams: { date } }).json()
      ).data,
  });
}

/**
 * @param {string | null} code Null while no note is open.
 * @returns {import('@tanstack/react-query').UseQueryResult<CreditNoteUse[]>}
 */
export function useCreditNoteUses(code) {
  return useQuery({
    queryKey: ['sales', 'credit-notes', code, 'uses'],
    queryFn: async () =>
      /** @type {{ data: CreditNoteUse[] }} */ (
        await api.get(`sales/credit-notes/${encodeURIComponent(String(code))}/uses`).json()
      ).data,
    enabled: code !== null,
  });
}
