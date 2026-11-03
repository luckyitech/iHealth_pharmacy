import { ERROR_CODES } from '@ihealth/shared/error-codes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { isApiError } from '@/lib/api-error';

import { fetchCurrentUser, login, logout } from './auth-api.js';

export const CURRENT_USER_KEY = /** @type {const} */ (['auth', 'me']);

/** @type {ReadonlySet<string>} */
const UNAUTHENTICATED_CODES = new Set([ERROR_CODES.UNAUTHENTICATED, ERROR_CODES.SESSION_EXPIRED]);

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export const isSignedOutError = (error) =>
  isApiError(error) && UNAUTHENTICATED_CODES.has(error.code);

/**
 * The signed-in user, or `null` when nobody is signed in.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult<import('./auth-api.js').CurrentUser | null>}
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: async () => {
      try {
        return await fetchCurrentUser();
      } catch (error) {
        if (isSignedOutError(error)) return null;
        throw error;
      }
    },
    staleTime: Infinity,
  });
}

/**
 * @returns {import('@tanstack/react-query').UseMutationResult<import('./auth-api.js').CurrentUser, unknown, import('@ihealth/shared/schemas').LoginBody>}
 */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => queryClient.setQueryData(CURRENT_USER_KEY, user),
  });
}

/**
 * Signs out and drops every cached query, so no data of this user stays in memory.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult<void, unknown, void>}
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(CURRENT_USER_KEY, null);
    },
  });
}
