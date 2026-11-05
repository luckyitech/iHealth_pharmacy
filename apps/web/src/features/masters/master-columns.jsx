/* eslint-disable jsdoc/reject-any-type -- helpers shared by master pages of every shape */

/**
 * A name column: bold, sortable, and "Unnamed" (muted) for legacy records without a name.
 *
 * @param {string} id
 * @param {string} header
 * @param {(row: any) => string} [value] Defaults to `row[id]`.
 * @returns {import('@/components/data-table/data-table').DataTableColumn}
 */
export function nameCell(id, header, value = (row) => row[id]) {
  return {
    id,
    header,
    sortable: true,
    cell: (row) => {
      const text = value(row);
      return text ? (
        <span className="font-medium">{text}</span>
      ) : (
        <span className="text-muted-foreground italic">Unnamed</span>
      );
    },
  };
}

/**
 * Form defaults from a record (or empty for a new one): every field of the input schema, `''` when missing.
 *
 * @param {import('zod').ZodObject} schema
 * @param {Record<string, unknown>} [defaults] Values for a new record.
 * @returns {(item: any | null) => Record<string, unknown>}
 */
export function formValuesFor(schema, defaults = {}) {
  const fields = Object.keys(schema.shape);
  return (item) =>
    Object.fromEntries(fields.map((field) => [field, item?.[field] ?? defaults[field] ?? '']));
}
