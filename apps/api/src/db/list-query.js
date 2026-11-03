import { buildListMeta } from '@ihealth/shared/schemas';

/**
 * @param {{ page: number, pageSize: number }} query
 * @returns {{ skip: number, take: number }}
 */
export function toPagination({ page, pageSize }) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/**
 * Translates the validated `sort` of a list query to a Prisma `orderBy`.
 * `columns` maps public field names to Prisma field names, so internal names never leak into the API.
 *
 * @template {string} Field
 * @param {{ field: Field, direction: 'asc' | 'desc' }} sort
 * @param {Record<Field, string>} columns
 * @returns {Record<string, 'asc' | 'desc'>}
 */
export function toOrderBy(sort, columns) {
  return { [columns[sort.field]]: sort.direction };
}

/**
 * Runs the count and page queries of a list endpoint together and builds the `{ data, meta }` body.
 *
 * @template T
 * @param {{ page: number, pageSize: number }} query
 * @param {{ count: () => Promise<number>, findMany: (pagination: { skip: number, take: number }) => Promise<T[]> }} source
 * @returns {Promise<{ data: T[], meta: import('@ihealth/shared/schemas').ListMeta }>}
 */
export async function paginate(query, { count, findMany }) {
  const [total, data] = await Promise.all([count(), findMany(toPagination(query))]);
  return { data, meta: buildListMeta({ page: query.page, pageSize: query.pageSize, total }) };
}
