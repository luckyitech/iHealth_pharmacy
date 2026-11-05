/* eslint-disable jsdoc/reject-any-type -- generic over every master table; rows are typed by each select */
/** Helpers shared by the master resources for the legacy column conventions. */
import { Prisma } from '#db';

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

/** A zero date as MySQL prints it. */
const ZERO_DATE = '0000-00-00';

/**
 * An `enrich` step that adds legacy DATE columns as `YYYY-MM-DD` text (null when empty or a zero
 * date), read with raw SQL: a zero date read through the model fails the whole query.
 *
 * @param {string} table Legacy table name (a constant, never user input).
 * @param {string} idColumn Its primary-key column, e.g. `CUSTOMER_ID`.
 * @param {Record<string, string>} columns API field -> DATE column, e.g. `{ birthDate: 'DOB_DT' }`.
 * @returns {(items: Record<string, any>[], prisma: any) => Promise<Record<string, any>[]>}
 */
export function legacyDates(table, idColumn, columns) {
  const selected = Prisma.raw(
    Object.entries(columns)
      .map(([field, column]) => `CAST(${column} AS CHAR) AS ${field}`)
      .join(', '),
  );
  return async (items, prisma) => {
    if (!items.length) return items;
    /** @type {Record<string, any>[]} */
    const rows = await prisma.$queryRaw`
      SELECT ${Prisma.raw(idColumn)} AS id, ${selected}
      FROM ${Prisma.raw(table)}
      WHERE ${Prisma.raw(idColumn)} IN (${Prisma.join(items.map((item) => item.id))})`;
    const byId = new Map(rows.map((row) => [row.id, row]));
    return items.map((item) => {
      const row = byId.get(item.id);
      /** @type {Record<string, string | null>} */
      const dates = {};
      for (const field of Object.keys(columns)) {
        const value = row?.[field];
        dates[field] = value && value !== ZERO_DATE ? value : null;
      }
      return { ...item, ...dates };
    });
  };
}

/**
 * Prisma data for a calendar date from the API (`YYYY-MM-DD`): midnight UTC, so a DATE column
 * keeps the same day.
 *
 * @param {string | null} value
 * @returns {Date | null}
 */
export const toLegacyDate = (value) => (value ? new Date(`${value}T00:00:00Z`) : null);
