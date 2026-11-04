/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { DataTable } from '@/components/data-table/data-table';
import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { usePermissions } from '@/features/auth/use-permissions';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useListParams } from '@/hooks/use-list-params';
import { useResourceList } from '@/lib/resource-api';

import { RecordDialog } from './record-dialog.jsx';

const STATUS_OPTIONS = Object.freeze([
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
]);

const DEFAULT_FILTERS = Object.freeze({ status: 'active' });

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
 * @property {'dialog' | 'page'} [editor] Where records are edited: a dialog for a handful of fields (default), their own page for large records.
 * @property {string[]} [sections] Section titles of a page editor, for its section menu (match the FormSection titles).
 * @property {(item: any) => string | null | undefined} [recordCode] A code shown under the record's name, e.g. the item code.
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
 * Records open in a dialog, or on their own edit page for large records (`editor: 'page'`). Each master only declares its
 * columns, fields and schema.
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
  const navigate = useNavigate();
  const location = useLocation();
  const canWrite = hasAny(config.writePermissions);
  /** @type {[any | null | undefined, (item: any | null | undefined) => void]} */
  const [editing, setEditing] = useState(/** @type {any | null | undefined} */ (undefined));

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

  /**
   * Opens a record (null for a new one): in the dialog, or on its own page, keeping the list's
   * search, filters and page in the URL to come back to.
   *
   * @param {any | null} row
   */
  const openRecord = (row) => {
    if (config.editor !== 'page') {
      setEditing(row);
      return;
    }
    /** @type {import('./record-editor-page.jsx').EditorLocationState} */
    const state = { listSearch: location.search };
    navigate(row ? `/${config.resource}/${row.id}/edit` : `/${config.resource}/new`, { state });
  };

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
          key={editing?.id ?? 'new'}
          config={config}
          item={editing}
          canWrite={canWrite}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
