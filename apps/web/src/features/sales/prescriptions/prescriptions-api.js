import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api-client';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').tillDoctorSchema>} Doctor
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').tillHospitalSchema>} Hospital
 * @typedef {{ firstName: string, lastName: string, licenseNumber?: string | null, phone?: string | null, hospitalId?: number | null }} NewDoctor
 */

/**
 * @template T
 * @param {Promise<{ data: T }>} body
 * @returns {Promise<T>}
 */
const data = async (body) => (await body).data;

/**
 * @param {string} q
 * @param {boolean} enabled
 * @returns {import('@tanstack/react-query').UseQueryResult<Doctor[]>}
 */
export function useDoctorSearch(q, enabled) {
  return useQuery({
    queryKey: ['sales', 'doctors', q],
    queryFn: () => data(api.get('sales/doctors', { searchParams: { q } }).json()),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * @param {string} q
 * @param {boolean} enabled
 * @returns {import('@tanstack/react-query').UseQueryResult<Hospital[]>}
 */
export function useHospitalSearch(q, enabled) {
  return useQuery({
    queryKey: ['sales', 'hospitals', q],
    queryFn: () => data(api.get('sales/hospitals', { searchParams: { q } }).json()),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** @returns {import('@tanstack/react-query').UseMutationResult<Doctor, Error, NewDoctor>} */
export function useAddDoctor() {
  return useMutation({
    mutationFn: (doctor) => data(api.post('sales/doctors', { json: doctor }).json()),
  });
}

/**
 * Opens a bill's prescription photo in a new tab.
 *
 * @param {number} billId
 * @returns {Promise<void>}
 */
export async function openPrescriptionPhoto(billId) {
  // Opened before the request, so the browser does not treat it as an unrequested pop-up.
  const tab = window.open('', '_blank');
  try {
    const blob = await api.get(`sales/bills/${billId}/prescription-photo`).blob();
    const url = URL.createObjectURL(blob);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
