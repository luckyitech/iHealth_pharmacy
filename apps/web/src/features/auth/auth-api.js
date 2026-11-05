import { api } from '@/lib/api-client';
import { setCsrfToken } from '@/lib/csrf-token';

/**
 * @typedef {object} CurrentUser
 * @property {number} employeeId
 * @property {string} username
 * @property {string} firstName
 * @property {string} lastName
 * @property {string | null} email
 * @property {number | null} pharmacyId
 * @property {{ roleId: number, name: string | null, pharmacyBranchId: number }[]} roles
 * @property {number[]} permissionIds
 * @property {boolean} [mustChangePassword] A temporary password must be replaced first.
 */

/**
 * @param {import('@ihealth/shared/schemas').LoginBody} credentials
 * @returns {Promise<CurrentUser>}
 */
export async function login(credentials) {
  /** @type {{ data: { user: CurrentUser, csrfToken: string } }} */
  const body = await api.post('auth/login', { json: credentials }).json();
  setCsrfToken(body.data.csrfToken);
  return body.data.user;
}

/**
 * Loads the signed-in user. After a page reload the CSRF token is gone from memory, so a fresh one is fetched too.
 *
 * @returns {Promise<CurrentUser>}
 */
export async function fetchCurrentUser() {
  /** @type {{ data: CurrentUser }} */
  const body = await api.get('auth/me').json();
  /** @type {{ data: { csrfToken: string } }} */
  const csrf = await api.get('auth/csrf').json();
  setCsrfToken(csrf.data.csrfToken);
  return body.data;
}

/**
 * @returns {Promise<void>}
 */
export async function logout() {
  try {
    await api.post('auth/logout');
  } finally {
    setCsrfToken(null);
  }
}

/**
 * @param {{ identifier: string }} body
 * @returns {Promise<string>} The API's message, identical whether or not the account exists.
 */
export async function requestPasswordReset(body) {
  /** @type {{ data: { message: string } }} */
  const response = await api.post('auth/forgot-password', { json: body }).json();
  return response.data.message;
}

/**
 * @param {{ token: string, password: string }} body
 * @returns {Promise<void>}
 */
export async function resetPassword(body) {
  await api.post('auth/reset-password', { json: body });
}

/**
 * Changes the signed-in user's own password. Other sessions end; this one is renewed.
 *
 * @param {{ currentPassword: string, newPassword: string }} body
 * @returns {Promise<void>}
 */
export async function changePassword(body) {
  /** @type {{ data: { csrfToken: string } }} */
  const response = await api.post('auth/change-password', { json: body }).json();
  setCsrfToken(response.data.csrfToken);
}
