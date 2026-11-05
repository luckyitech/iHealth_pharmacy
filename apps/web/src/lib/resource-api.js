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
 * @returns {import('@tanstack/react-query').UseQueryResult<{ data: T[], meta: ListMeta }>}
 */
export function useResourceList(resource, { page, pageSize, sort, q, filters = {} }) {
  const searchParams = Object.fromEntries(
    Object.entries({ page, pageSize, sort, q, ...filters }).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  return useQuery({
    queryKey: [...resourceKey(resource), 'list', searchParams],
    queryFn: () => api.get(resource, { searchParams }).json(),
    placeholderData: keepPreviousData,
  });
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
