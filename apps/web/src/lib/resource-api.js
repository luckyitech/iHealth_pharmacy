/* eslint-disable jsdoc/reject-any-type -- generic over every resource's row shape */
import { MAX_PAGE_SIZE } from '@ihealth/shared/schemas';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './api-client.js';

/**
 * @typedef {{ page: number, pageSize: number, sort: string, q?: string, filters?: Record<string, string> }} ListRequest
 * @typedef {{ page: number, pageSize: number, total: number, totalPages: number }} ListMeta
 */

/**
 * @param {string} resource e.g. `masters/manufacturers`
 * @returns {readonly unknown[]}
 */
export const resourceKey = (resource) => ['resource', resource];

/**
 * A page of a resource. The previous page stays on screen while the next one loads.
 *
 * @template T
 * @param {string} resource
 * @param {ListRequest} request
 * @param {{ enabled?: boolean }} [options] `enabled: false` waits (e.g. until a picker is opened).
 * @returns {import('@tanstack/react-query').UseQueryResult<{ data: T[], meta: ListMeta }>}
 */
export function useResourceList(
  resource,
  { page, pageSize, sort, q, filters = {} },
  { enabled = true } = {},
) {
  const searchParams = Object.fromEntries(
    Object.entries({ page, pageSize, sort, q, ...filters }).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  return useQuery({
    queryKey: [...resourceKey(resource), 'list', searchParams],
    queryFn: () => api.get(resource, { searchParams }).json(),
    placeholderData: keepPreviousData,
    enabled,
  });
}

const ACTIVE_ONLY = Object.freeze({ status: 'active' });

/**
 * Active records of a short resource (up to one page), as select options sorted by name.
 *
 * @param {string} resource e.g. `masters/item-groups`
 * @param {(row: any) => string} [label] Defaults to `row.name`.
 * @returns {{ options: { value: number, label: string }[], isPending: boolean }}
 */
export function useResourceOptions(resource, label = (row) => row.name) {
  const list = useResourceList(resource, {
    page: 1,
    pageSize: MAX_PAGE_SIZE,
    sort: 'name',
    filters: ACTIVE_ONLY,
  });
  const rows = /** @type {any[]} */ (
    /** @type {{ data?: unknown[] } | undefined} */ (list.data)?.data ?? []
  );
  return {
    options: rows.map((row) => ({ value: row.id, label: label(row) || `#${row.id}` })),
    isPending: list.isPending,
  };
}

/**
 * Create (no id) or update (id) a record, then refresh every list and detail of the resource.
 *
 * @template T
 * @param {string} resource
 * @returns {import('@tanstack/react-query').UseMutationResult<T, unknown, { id?: number, values: Record<string, unknown> }>}
 */
export function useSaveResource(resource) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }) => {
      /** @type {{ data: T }} */
      const body =
        id === undefined
          ? await api.post(resource, { json: values }).json()
          : await api.patch(`${resource}/${id}`, { json: values }).json();
      return body.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resourceKey(resource) }),
  });
}

/**
 * Deactivate or restore a record (legacy ACTIVE_S).
 *
 * @param {string} resource
 * @returns {import('@tanstack/react-query').UseMutationResult<void, unknown, { id: number, active: boolean }>}
 */
export function useSetResourceActive(resource) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }) => {
      if (active) await api.post(`${resource}/${id}/restore`);
      else await api.delete(`${resource}/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resourceKey(resource) }),
  });
}
