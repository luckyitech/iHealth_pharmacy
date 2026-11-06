import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').billLabelsSchema>} BillLabels
 * @typedef {{ lineId: number, text: string, copies: number }} LabelInput
 */

/**
 * @param {number | null} billId
 * @returns {import('@tanstack/react-query').UseQueryResult<BillLabels>}
 */
export function useBillLabels(billId) {
  return useQuery({
    queryKey: ['sales', 'bills', billId, 'labels'],
    queryFn: async () =>
      /** @type {{ data: BillLabels }} */ (await api.get(`sales/bills/${billId}/labels`).json())
        .data,
    enabled: billId !== null,
  });
}

/**
 * Opens a PDF the server makes, in a new tab opened first so it is not taken for a pop-up.
 *
 * @param {() => Promise<Blob>} load
 * @returns {Promise<void>}
 */
async function openPdf(load) {
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await load());
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/**
 * Prints a bill's stickers; the server keeps what was printed.
 *
 * @param {number} billId
 * @param {LabelInput[]} labels
 * @returns {Promise<void>}
 */
export const printLabels = (billId, labels) =>
  openPdf(() => api.post(`sales/bills/${billId}/labels`, { json: { labels } }).blob());

/**
 * Prints a bill's stickers again, exactly as last printed.
 *
 * @param {number} billId
 * @returns {Promise<void>}
 */
export const reprintLabels = (billId) =>
  openPdf(() => api.get(`sales/bills/${billId}/labels/pdf`).blob());
