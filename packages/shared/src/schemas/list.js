import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const SORT_DIRECTIONS = Object.freeze({ ASC: 'asc', DESC: 'desc' });

/**
 * @template {string} Field
 * @typedef {{ field: Field, direction: 'asc' | 'desc' }} SortSpec
 */

/**
 * Builds the query schema for a list endpoint: `?page=2&pageSize=50&sort=-createdAt&q=panadol`.
 * `sort` takes a field name, prefixed with `-` for descending order. Only whitelisted fields are accepted.
 *
 * @template {string} Field
 * @template {z.ZodRawShape} Filters
 * @param {object} options
 * @param {readonly [Field, ...Field[]]} options.sortable Fields the client may sort by.
 * @param {`${Field}` | `-${Field}`} options.defaultSort
 * @param {Filters} [options.filters] Extra, endpoint-specific filter fields.
 * @returns The Zod schema; its output has `page`, `pageSize`, `sort: { field, direction }`, `q` and the filters.
 */
export function createListQuerySchema({ sortable, defaultSort, filters }) {
  const sortValues = sortable.flatMap((field) => [field, `-${field}`]);
  return z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
      sort: z
        .string()
        .default(defaultSort)
        .refine((value) => sortValues.includes(value), `Sort by one of: ${sortable.join(', ')}`)
        .transform((value) => {
          const descending = value.startsWith('-');
          return /** @type {SortSpec<Field>} */ ({
            field: descending ? value.slice(1) : value,
            direction: descending ? SORT_DIRECTIONS.DESC : SORT_DIRECTIONS.ASC,
          });
        }),
      q: z.string().trim().max(100).optional(),
    })
    .extend(/** @type {Filters} */ (filters ?? {}));
}

export const listMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

/** @typedef {z.infer<typeof listMetaSchema>} ListMeta */

/**
 * @param {{ page: number, pageSize: number, total: number }} input
 * @returns {ListMeta}
 */
export function buildListMeta({ page, pageSize, total }) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

/**
 * Response body for a single resource: `{ data }`.
 *
 * @template {z.ZodType} T
 * @param {T} schema
 * @returns The `{ data }` envelope schema.
 */
export function dataResponseSchema(schema) {
  return z.object({ data: schema });
}

/**
 * Response body for a list endpoint: `{ data: [...], meta: { page, pageSize, total, totalPages } }`.
 *
 * @template {z.ZodType} T
 * @param {T} itemSchema
 * @returns The `{ data, meta }` envelope schema.
 */
export function listResponseSchema(itemSchema) {
  return z.object({ data: z.array(itemSchema), meta: listMetaSchema });
}
