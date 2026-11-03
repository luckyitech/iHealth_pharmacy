/**
 * Only same-app paths are followed after sign-in, so a crafted link cannot send users to another site.
 *
 * @param {string | null} value
 * @returns {string}
 */
export function safeRedirect(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
