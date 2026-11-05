/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { DEFAULT_PAGE_SIZE } from '@ihealth/shared/schemas';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * @typedef {object} ListParams
 * @property {number} page
 * @property {number} pageSize
 * @property {string} sort e.g. `name` or `-createdAt`
 * @property {string} q
 * @property {Record<string, string>} filters Any other query parameter (status, category, ...).
 */

const RESERVED = new Set(['page', 'pageSize', 'sort', 'q']);

/**
 * List state (page, size, sort, search, filters) kept in the URL, so a list can be bookmarked,
 * shared and restored with the back button.
 *
 * @param {{ defaultSort: string, defaultFilters?: Record<string, string> }} options
 * @returns {{ params: ListParams, setParams: (patch: Partial<Omit<ListParams, 'filters'>> & { filters?: Record<string, string | undefined> }) => void }}
 */
export function useListParams({ defaultSort, defaultFilters = {} }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    /** @type {Record<string, string>} */
    const filters = { ...defaultFilters };
    for (const [key, value] of searchParams) if (!RESERVED.has(key)) filters[key] = value;
    return {
      page: Math.max(1, Number(searchParams.get('page')) || 1),
      pageSize: Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE,
      sort: searchParams.get('sort') || defaultSort,
      q: searchParams.get('q') ?? '',
      filters,
    };
  }, [searchParams, defaultSort, defaultFilters]);

  const setParams = useCallback(
    (/** @type {any} */ patch) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          const set = (/** @type {string} */ key, /** @type {unknown} */ value) =>
            value === undefined || value === '' || value === null
              ? next.delete(key)
              : next.set(key, String(value));
          for (const key of ['page', 'pageSize', 'sort', 'q'])
            if (key in patch) set(key, patch[key]);
          for (const [key, value] of Object.entries(patch.filters ?? {})) set(key, value);
          // Changing what is shown starts again from the first page.
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return { params, setParams };
}
