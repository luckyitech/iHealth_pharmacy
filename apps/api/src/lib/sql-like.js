/**
 * @param {string} value
 * @returns {string} The value with LIKE wildcards escaped, so it matches literally.
 */
export const escapeLike = (value) => value.replace(/[\\%_]/g, (match) => `\\${match}`);
