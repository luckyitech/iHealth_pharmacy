import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').controlledItemSchema>} ControlledItem
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').controlledRegisterSchema>} ControlledRegister
 * @typedef {{ itemId: number, from: string, to: string }} RegisterQuery
 */

const REGISTER = 'sales/controlled-register';

/** @returns {import('@tanstack/react-query').UseQueryResult<ControlledItem[]>} */
export function useControlledItems() {
  return useQuery({
    queryKey: ['sales', 'controlled-register', 'items'],
    queryFn: async () =>
      /** @type {{ data: ControlledItem[] }} */ (await api.get(`${REGISTER}/items`).json()).data,
  });
}

/**
 * @param {RegisterQuery | null} query Null until a medicine is chosen.
 * @returns {import('@tanstack/react-query').UseQueryResult<ControlledRegister>}
 */
export function useControlledRegister(query) {
  return useQuery({
    queryKey: ['sales', 'controlled-register', query],
    queryFn: async () =>
      /** @type {{ data: ControlledRegister }} */ (
        await api.get(REGISTER, { searchParams: /** @type {RegisterQuery} */ (query) }).json()
      ).data,
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });
}

/**
 * Opens the register as a PDF in a new tab, to print or save.
 *
 * @param {RegisterQuery} query
 * @returns {Promise<void>}
 */
export async function openRegisterPdf(query) {
  // Opened before the request, so the browser does not treat it as an unrequested pop-up.
  const tab = window.open('', '_blank');
  try {
    const blob = await api.get(`${REGISTER}/pdf`, { searchParams: query }).blob();
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
