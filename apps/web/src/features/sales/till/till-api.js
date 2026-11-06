import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { resourceKey } from '@/lib/resource-api';

import { BILLS } from '../history/sales-api.js';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').batchSearchSchema>} BatchSearch
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').sellableBatchSchema>} SellableBatch
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').saleQuoteSchema>} SaleQuote
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').heldSaleSummarySchema>} HeldSaleSummary
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').heldSaleSchema>} HeldSale
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').tillCustomerSchema>} TillCustomerOption
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').tillSettingsSchema>} TillSettings
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').completedSaleSchema>} CompletedSale
 * @typedef {{ stockId: number, quantity: number, discountPercent: number }} LineInput
 */

const HELD = 'sales/held';
/** Search results stay fresh briefly: stock changes as other tills sell. */
const SEARCH_STALE_MS = 10_000;

/**
 * @template T
 * @param {Promise<{ data: T }>} body
 * @returns {Promise<T>}
 */
const data = async (body) => (await body).data;

/**
 * @param {string} q
 * @returns {readonly unknown[]}
 */
export const batchSearchKey = (q) => ['sales', 'batches', q];

/**
 * @param {string} q
 * @returns {Promise<BatchSearch>}
 */
export const fetchBatches = (q) => data(api.get('sales/batches', { searchParams: { q } }).json());

/**
 * Batches matching a search, kept while the next search loads so the list does not flicker.
 *
 * @param {string} q
 * @returns {import('@tanstack/react-query').UseQueryResult<BatchSearch>}
 */
export function useBatchSearch(q) {
  return useQuery({
    queryKey: batchSearchKey(q),
    queryFn: () => fetchBatches(q),
    enabled: q.length > 0,
    staleTime: SEARCH_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

/**
 * @param {string} q At least two characters.
 * @param {boolean} enabled
 * @returns {import('@tanstack/react-query').UseQueryResult<TillCustomerOption[]>}
 */
export function useCustomerSearch(q, enabled) {
  return useQuery({
    queryKey: ['sales', 'customers', q],
    queryFn: () => data(api.get('sales/customers', { searchParams: { q } }).json()),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * @param {LineInput[]} lines
 * @returns {readonly unknown[]}
 */
export const quoteKey = (lines) => ['sales', 'quote', lines];

/**
 * @param {LineInput[]} lines
 * @returns {Promise<SaleQuote>}
 */
export const fetchQuote = (lines) => data(api.post('sales/quote', { json: { lines } }).json());

/**
 * The server's prices for the lines on the till. Only batches, quantities and discounts are sent.
 *
 * @param {LineInput[]} lines
 * @returns {import('@tanstack/react-query').UseQueryResult<SaleQuote>}
 */
export function useQuote(lines) {
  return useQuery({
    queryKey: quoteKey(lines),
    queryFn: () => fetchQuote(lines),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}

/**
 * @returns {import('@tanstack/react-query').UseQueryResult<TillSettings>}
 */
export function useTillSettings() {
  return useQuery({
    queryKey: ['sales', 'till-settings'],
    queryFn: () => data(api.get('sales/till-settings').json()),
    staleTime: Infinity,
  });
}

/**
 * Banks a cheque can be drawn on (kept under Masters → Banks).
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<{ id: number, name: string }[]>}
 */
export function useBanks() {
  return useQuery({
    queryKey: ['sales', 'banks'],
    queryFn: () => data(api.get('sales/banks').json()),
  });
}

/**
 * @returns {import('@tanstack/react-query').UseQueryResult<HeldSaleSummary[]>}
 */
export function useHeldSales() {
  return useQuery({ queryKey: resourceKey(HELD), queryFn: () => data(api.get(HELD).json()) });
}

/**
 * @returns {import('@tanstack/react-query').UseMutationResult<CompletedSale, unknown, Record<string, unknown>>}
 */
export function useCompleteSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => data(api.post(BILLS, { json: body }).json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceKey(BILLS) });
      queryClient.invalidateQueries({ queryKey: ['sales', 'batches'] });
    },
  });
}

/**
 * @returns {import('@tanstack/react-query').UseMutationResult<HeldSaleSummary, unknown, Record<string, unknown>>}
 */
export function useHoldSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => data(api.post(HELD, { json: body }).json()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: resourceKey(HELD) }),
  });
}

/**
 * @returns {import('@tanstack/react-query').UseMutationResult<HeldSale, unknown, number>}
 */
export function useRecallSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => data(api.post(`${HELD}/${id}/recall`).json()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: resourceKey(HELD) }),
  });
}

/**
 * @returns {import('@tanstack/react-query').UseMutationResult<unknown, unknown, number>}
 */
export function useDiscardHeldSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`${HELD}/${id}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: resourceKey(HELD) }),
  });
}
