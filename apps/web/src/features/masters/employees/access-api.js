import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api-client';
import { resourceKey } from '@/lib/resource-api';

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').employeeAccessSchema>} EmployeeAccess
 */

const EMPLOYEES = 'masters/employees';

/**
 * @param {number} employeeId
 * @returns {readonly unknown[]}
 */
const accessKey = (employeeId) => [...resourceKey(EMPLOYEES), 'access', employeeId];

/**
 * @param {number} employeeId
 * @returns {import('@tanstack/react-query').UseQueryResult<EmployeeAccess>}
 */
export function useEmployeeAccess(employeeId) {
  return useQuery({
    queryKey: accessKey(employeeId),
    queryFn: async () =>
      /** @type {{ data: EmployeeAccess }} */ (
        await api.get(`${EMPLOYEES}/${employeeId}/access`).json()
      ).data,
  });
}

/**
 * One access action (`PUT .../access/password`, `POST .../access/unlock`, ...). The API answers
 * with the access afterwards, which replaces the cached one.
 *
 * @param {number} employeeId
 * @param {'put' | 'post'} method
 * @param {string} path e.g. `password`
 * @returns {import('@tanstack/react-query').UseMutationResult<EmployeeAccess, unknown, Record<string, unknown> | void>}
 */
export function useAccessAction(employeeId, method, path) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      /** @type {{ data: EmployeeAccess }} */ (
        await api[method](`${EMPLOYEES}/${employeeId}/access/${path}`, { json: body ?? {} }).json()
      ).data,
    onSuccess: (access) => queryClient.setQueryData(accessKey(employeeId), access),
  });
}

/**
 * @returns {import('@tanstack/react-query').UseQueryResult<{ id: number, name: string }[]>}
 */
export function useRoles() {
  return useQuery({
    queryKey: ['lookups', 'roles'],
    queryFn: async () =>
      /** @type {{ data: { id: number, name: string }[] }} */ (
        await api.get('lookups/roles').json()
      ).data,
    staleTime: Infinity,
  });
}
