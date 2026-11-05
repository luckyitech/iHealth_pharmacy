/**
 * The CSRF token is kept in memory only (never in storage), so other scripts on the page cannot persist it.
 * After a reload the app asks the API for a new one.
 */
let token = /** @type {string | null} */ (null);

/** @returns {string | null} */
export const getCsrfToken = () => token;

/** @param {string | null} value */
export const setCsrfToken = (value) => {
  token = value;
};
