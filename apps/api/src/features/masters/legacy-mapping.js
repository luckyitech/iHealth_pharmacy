/* eslint-disable jsdoc/reject-any-type -- generic over every master table; rows are typed by each select */
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

/**
 * Address columns, named the same in most legacy master tables.
 */
export const ADDRESS_COLUMNS = Object.freeze({
  addressLine1: 'addressLine1',
  addressLine2: 'addressLine2',
  city: 'cityNm',
  zip: 'zipCd',
  countryId: 'countryId',
  provinceId: 'provincesId',
});

/**
 * Select, row -> item and input -> data for a table whose API fields map one-to-one to columns.
 * Text columns are trimmed (empty = null); fields ending in `Id` are kept as numbers.
 *
 * @param {string} idField Prisma primary-key field.
 * @param {Record<string, string>} columns API field -> Prisma field.
 * @param {string[]} [requiredText] API text fields that are never null in the API (empty string instead).
 * @returns {{ select: Record<string, boolean>, toItem: (row: Record<string, any>) => Record<string, unknown>, toData: (input: Record<string, unknown>) => Record<string, unknown> }}
 */
export function columnMapping(idField, columns, requiredText = []) {
  return {
    // Legacy timestamps are never selected: some rows hold zero dates, which fail the whole read.
    select: Object.fromEntries(
      [idField, 'activeS', ...Object.values(columns)].map((column) => [column, true]),
    ),
    toItem: (row) => {
      /** @type {Record<string, unknown>} */
      const item = { id: row[idField], active: isActive(row.activeS) };
      for (const [field, column] of Object.entries(columns)) {
        const value = row[column];
        if (field.endsWith('Id')) item[field] = value ?? null;
        else item[field] = requiredText.includes(field) ? (text(value) ?? '') : text(value);
      }
      return item;
    },
    toData: (input) => pickColumns(input, columns),
  };
}
