/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { Loader2, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { applyServerErrors, useZodForm } from '@/components/form/use-zod-form';
import { DataTable } from '@/components/data-table/data-table';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { usePermissions } from '@/features/auth/use-permissions';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useListParams } from '@/hooks/use-list-params';
import { errorMessage } from '@/lib/api-error';
import { useResourceList, useSaveResource, useSetResourceActive } from '@/lib/resource-api';

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
 * @property {boolean} [wideForm] A wider side panel, for long forms.
 */

/**
 * @typedef {object} ListFilter
 * @property {string} key Query parameter, e.g. `productKind`.
 * @property {string} label Accessible name, e.g. "Kind".
 * @property {string} allLabel The "no filter" option, e.g. "All kinds".
 * @property {readonly { value: string, label: string }[]} options
 */

/**
 * The standard master-data screen: a searchable, sortable, paged list with an active/inactive filter,
 * and a side panel to create, edit, deactivate or restore a record. Each master only declares its
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

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing(null)}>
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
        onRowClick={(row) => setEditing(row)}
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

      <RecordSheet
        config={config}
        item={editing}
        canWrite={canWrite}
        onClose={() => setEditing(undefined)}
      />
    </div>
  );
}

/**
 * @param {{ config: MasterResourceConfig, item: any | null | undefined, canWrite: boolean, onClose: () => void }} props
 * @returns {React.JSX.Element}
 */
function RecordSheet({ config, item, canWrite, onClose }) {
  const open = item !== undefined;
  const isNew = item === null;
  const save = useSaveResource(config.resource);
  const setActive = useSetResourceActive(config.resource);
  const [confirming, setConfirming] = useState(false);
  const form = useZodForm(config.schema, { defaultValues: config.toFormValues(item ?? null) });
  const { reset } = form;

  useEffect(() => {
    if (open) {
      reset(config.toFormValues(item ?? null));
      save.reset();
    }
    // Reset only when another record is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(
      { id: isNew ? undefined : item.id, values },
      {
        onSuccess: () => {
          toast.success(isNew ? `${capitalise(config.singular)} created` : 'Changes saved');
          onClose();
        },
        onError: (error) => applyServerErrors(error, form.setError),
      },
    ),
  );

  const formError = save.isError && !applyServerErrorsPreview(save.error);
  const title = isNew ? `New ${config.singular}` : item ? config.recordName(item) : '';

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        className={config.wideForm ? 'max-w-3xl' : undefined}
        showTitle
        title={title}
        description={isNew ? undefined : item?.active === false ? 'Inactive' : undefined}
      >
        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={onSubmit}>
          <fieldset
            disabled={!canWrite || save.isPending}
            className="grid flex-1 content-start gap-5 overflow-y-auto px-6 py-6"
          >
            {formError && <FormError>{errorMessage(save.error)}</FormError>}
            {open && <config.Fields form={form} item={item ?? null} />}
          </fieldset>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2 border-t px-6 py-4">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
                {isNew ? `Create ${config.singular}` : 'Save changes'}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {!isNew && item && (
                <Button
                  type="button"
                  variant="ghost"
                  className={
                    item.active === false
                      ? 'ml-auto'
                      : 'ml-auto text-destructive hover:text-destructive'
                  }
                  onClick={() => setConfirming(true)}
                >
                  {item.active === false ? 'Restore' : 'Deactivate'}
                </Button>
              )}
            </div>
          )}
        </form>
        {item && (
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            destructive={item.active !== false}
            title={
              item.active === false
                ? `Restore ${config.recordName(item)}?`
                : `Deactivate ${config.recordName(item)}?`
            }
            description={
              item.active === false
                ? 'It will be available again everywhere it is used.'
                : 'It will no longer be offered for new transactions. Its history stays, and you can restore it later.'
            }
            confirmLabel={item.active === false ? 'Restore' : 'Deactivate'}
            onConfirm={async () => {
              await setActive.mutateAsync({ id: item.id, active: item.active === false });
              toast.success(item.active === false ? 'Restored' : 'Deactivated');
              onClose();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Whether an error is only about fields (then it is shown next to them, not at the top).
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function applyServerErrorsPreview(error) {
  let applied = false;
  applyServerErrors(error, () => {
    applied = true;
  });
  return applied;
}

/**
 * @param {string} text
 * @returns {string}
 */
const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);
