/** Helpers shared by the master resources for the legacy column conventions. */

/**
 * Legacy `ACTIVE_S`: 'Y', 'N', lowercase variants or NULL (old rows); NULL counts as active, as in the legacy app.
 *
 * @param {string | null | undefined} flag
 * @returns {boolean}
 */
export const isActive = (flag) => flag?.toUpperCase() !== 'N';

/**
 * Legacy text columns often carry stray spaces; empty strings are shown as missing.
 *
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export const text = (value) => value?.trim() || null;

/**
 * @param {Date | null | undefined} value
 * @returns {string | null}
 */
export const isoDate = (value) =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;

/**
 * Copies only the keys present in `input` to Prisma column names, so a PATCH touches only what was sent.
 *
 * @param {Record<string, unknown>} input API fields
 * @param {Record<string, string>} columns API field -> Prisma field
 * @returns {Record<string, unknown>}
 */
export function pickColumns(input, columns) {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [field, column] of Object.entries(columns))
    if (field in input) data[column] = input[field];
  return data;
}

/** Legacy audit columns filled on every write. */
export const LEGACY_STAMPS = Object.freeze({
  createdBy: 'creationUserId',
  updatedBy: 'lastUpdateUserId',
  updatedAt: 'lastUpdateTs',
});
