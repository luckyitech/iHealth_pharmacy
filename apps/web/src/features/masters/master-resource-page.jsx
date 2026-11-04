/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table/data-table';
import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { usePermissions } from '@/features/auth/use-permissions';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useListParams } from '@/hooks/use-list-params';
import { useResource, useResourceList } from '@/lib/resource-api';

import { RecordDialog } from './record-dialog.jsx';

const STATUS_OPTIONS = Object.freeze([
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
]);

const DEFAULT_FILTERS = Object.freeze({ status: 'active' });

/** URL parameter of the record open in the edit dialog, and its value for a new record. */
const EDIT_PARAM = 'edit';
const NEW_RECORD = 'new';

/**
 * @typedef {object} MasterResourceConfig
 * @property {string} resource API path under /api/v1, e.g. `masters/manufacturers`.
 * @property {string} title Plural, e.g. "Manufacturers".
 * @property {string} singular e.g. "manufacturer"
 * @property {string} description One line under the title.
 * @property {import('@/components/data-table/data-table').DataTableColumn[]} columns
 * @property {string} defaultSort
 * @property {string} searchPlaceholder
 * @property {import('zod').ZodType} schema Shared Zod input schema (the API validates the same).
 * @property {(item: any | null) => Record<string, unknown>} toFormValues Record (or null for new) -> form defaults.
 * @property {(props: { form: import('react-hook-form').UseFormReturn<any>, item: any | null }) => React.ReactNode} Fields The form's fields; `item` is the record edited (null for a new one).
 * @property {readonly import('@ihealth/shared/permissions').PermissionDefinition[]} writePermissions
 * @property {(item: any) => string} recordName How a record is named in dialogs, e.g. its name.
 * @property {ListFilter[]} [listFilters] Extra filters next to "Show".
 * @property {'small' | 'large'} [dialogSize] The edit dialog: narrow for a handful of fields (default), wide for large records.
 * @property {string[]} [sections] Section titles of a large record, for the dialog's section links (match the FormSection titles).
 * @property {{ id: string, label: string, Component: (props: { item: any, canWrite: boolean }) => React.ReactNode, permissions: readonly import('@ihealth/shared/permissions').PermissionDefinition[] }[]} [tabs] Extra tabs (each shown to users with one of its permissions) of a saved record's dialog, beside "Details" (e.g. an employee's sign-in and access).
 * @property {(item: any) => string | null | undefined} [recordCode] A code shown under the record's name, e.g. the item code.
 * @property {(props: { filters: Record<string, string>, setFilters: (filters: Record<string, string | undefined>) => void }) => React.ReactNode} [ListContext]
 *   Shown above the search and filters, e.g. to say which item a list is narrowed to.
 * @property {(filters: Record<string, string>) => Record<string, unknown>} [newRecordDefaults] Values a new record takes
 *   from the list's filters, e.g. the item a list of its suppliers is filtered by.
 */

/**
 * @typedef {object} ListFilter
 * @property {string} key Query parameter, e.g. `productKind`.
 * @property {string} label Accessible name, e.g. "Kind".
 * @property {string} allLabel The "no filter" option, e.g. "All kinds".
 * @property {readonly { value: string, label: string }[]} options
 */

/**
 * The standard master-data screen: a searchable, sortable, paged list with an active/inactive filter.
 * Records open in a centred dialog over the list; `?edit=<id>` (or `?edit=new`) in the URL opens one,
 * so a record can be linked to. Each master only declares its columns, fields and schema.
 *
 * @param {{ config: MasterResourceConfig }} props
 * @returns {React.JSX.Element}
 */
export function MasterResourcePage({ config }) {
  const { params, setParams } = useListParams({
    defaultSort: config.defaultSort,
    defaultFilters: DEFAULT_FILTERS,
  });
  const [search, setSearch] = useState(params.q);
  const debouncedSearch = useDebouncedValue(search);
  const { hasAny } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const canWrite = hasAny(config.writePermissions);

  useEffect(() => {
    if (debouncedSearch !== params.q) setParams({ q: debouncedSearch });
  }, [debouncedSearch, params.q, setParams]);

  const list = useResourceList(config.resource, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    q: params.q,
    filters: params.filters,
  });

  const isMuted = (/** @type {any} */ item) => item.active === false;

  // The record in the edit dialog lives in the URL (`?edit=48` or `?edit=new`), next to the list's
  // own search, filters and page, which stay as they are.
  const editParam = searchParams.get(EDIT_PARAM);
  const editId = editParam && editParam !== NEW_RECORD ? Number(editParam) : undefined;
  const rows = /** @type {any[] | undefined} */ (/** @type {any} */ (list.data)?.data);
  const fromList = editId === undefined ? undefined : rows?.find((row) => row.id === editId);
  // Opened from a link, the record may not be on this page of the list: load it.
  const loaded = useResource(config.resource, fromList ? undefined : editId);
  const editing =
    editParam === NEW_RECORD
      ? null
      : (fromList ?? (editId === undefined ? undefined : loaded.data));

  /**
   * @param {string | null} value A record id, NEW_RECORD, or null to close.
   * @returns {void}
   */
  const setEditParam = (value) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null) next.delete(EDIT_PARAM);
        else next.set(EDIT_PARAM, value);
        return next;
      },
      { replace: true },
    );

  /**
   * @param {any | null} row The record, or null for a new one.
   * @returns {void}
   */
  const openRecord = (row) => setEditParam(row ? String(row.id) : NEW_RECORD);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        {canWrite && (
          <Button onClick={() => openRecord(null)}>
            <Plus aria-hidden="true" />
            New {config.singular}
          </Button>
        )}
      </div>

      {config.ListContext && (
        <config.ListContext
          filters={params.filters}
          setFilters={(filters) => setParams({ filters })}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={`Search ${config.title.toLowerCase()}`}
            placeholder={config.searchPlaceholder}
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <NativeSelect
          aria-label="Show"
          className="w-36"
          value={params.filters.status}
          onChange={(event) => setParams({ filters: { status: event.target.value } })}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        {config.listFilters?.map((filter) => (
          <NativeSelect
            key={filter.key}
            aria-label={filter.label}
            className="w-40"
            value={params.filters[filter.key] ?? ''}
            onChange={(event) => setParams({ filters: { [filter.key]: event.target.value } })}
          >
            <option value="">{filter.allLabel}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        ))}
      </div>

      <DataTable
        caption={config.title}
        columns={config.columns}
        rows={/** @type {any} */ (list.data)?.data}
        meta={/** @type {any} */ (list.data)?.meta}
        sort={params.sort}
        onSortChange={(sort) => setParams({ sort })}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize })}
        getRowId={(row) => row.id}
        onRowClick={(row) => openRecord(row)}
        isRowMuted={isMuted}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={
          <PageState
            state="empty"
            title={
              params.q
                ? `No ${config.title.toLowerCase()} match “${params.q}”`
                : `No ${config.title.toLowerCase()} yet`
            }
            description={
              params.filters.status === 'active'
                ? 'Inactive records are hidden. Change “Show” to see them.'
                : undefined
            }
          />
        }
      />

      {editing !== undefined && (
        <RecordDialog
          key={editing?.id ?? NEW_RECORD}
          config={config}
          item={editing}
          defaults={editing === null ? config.newRecordDefaults?.(params.filters) : undefined}
          canWrite={canWrite}
          onClose={() => setEditParam(null)}
        />
      )}
    </div>
  );
}
