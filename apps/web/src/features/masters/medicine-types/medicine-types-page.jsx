/* eslint-disable jsdoc/reject-any-type -- item rows come from the generic list API */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useConfirm } from '@/hooks/use-confirm';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useListParams } from '@/hooks/use-list-params';
import { api } from '@/lib/api-client';
import { useScheduleCodes } from '@/lib/lookups';
import { notify } from '@/lib/notify';
import { resourceKey, useResourceList } from '@/lib/resource-api';

const ITEMS = 'masters/items';
const DEFAULT_SORT = 'name';
const ACTIVE = Object.freeze({ status: 'active' });
/** The "no type" choice in the type picker. */
const NO_TYPE = 'none';

/**
 * Masters → Medicine types: a pharmacist goes through the items and marks which are
 * prescription-only, controlled or antibiotic, many at a time. The till tags them and asks for the
 * prescription; controlled drugs go in the register.
 *
 * @returns {React.JSX.Element}
 */
export default function MedicineTypesPage() {
  const queryClient = useQueryClient();
  const { ask, dialog } = useConfirm();
  const { params, setParams } = useListParams({
    defaultSort: DEFAULT_SORT,
    defaultFilters: ACTIVE,
  });
  const [search, setSearch] = useState(params.q);
  const debouncedSearch = useDebouncedValue(search);
  const [selected, setSelected] = useState(/** @type {Map<number, string>} */ (new Map()));
  const [type, setType] = useState('');
  const codes = useScheduleCodes();
  const names = new Map((codes.data ?? []).map((code) => [code.id, code.name]));

  useEffect(() => {
    if (debouncedSearch !== params.q) setParams({ q: debouncedSearch });
  }, [debouncedSearch, params.q, setParams]);

  const list = useResourceList(ITEMS, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    q: params.q,
    filters: params.filters,
  });
  const rows = /** @type {any[] | undefined} */ (/** @type {any} */ (list.data)?.data);

  useEffect(() => {
    if (list.error)
      notify.failure('Could not load the items', list.error, { id: 'medicine-items' });
  }, [list.error]);
  useEffect(() => {
    if (codes.error)
      notify.failure('Could not load the medicine types', codes.error, { id: 'schedule-codes' });
  }, [codes.error]);

  const save = useMutation({
    /**
     * @param {{ itemIds: number[], scheduleCodeId: number | null }} body
     * @returns {Promise<{ updated: number }>}
     */
    mutationFn: async (body) =>
      /** @type {{ data: { updated: number } }} */ (
        await api.post(`${ITEMS}/medicine-type`, { json: body }).json()
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resourceKey(ITEMS) }),
  });

  /**
   * @param {any} row
   * @returns {void}
   */
  const toggle = (row) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row.name ?? row.code ?? `Item ${row.id}`);
      return next;
    });
  const pageIds = (rows ?? []).map((row) => row.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const apply = () => {
    const scheduleCodeId = type === NO_TYPE ? null : Number(type);
    const label = scheduleCodeId === null ? 'no type' : names.get(scheduleCodeId);
    const count = selected.size;
    ask({
      title: `Mark ${count} ${count === 1 ? 'item' : 'items'} as ${label}?`,
      description: [...selected.values()].slice(0, 5).join(', ') + (count > 5 ? ', …' : ''),
      confirmLabel: 'Change type',
      onConfirm: async () => {
        try {
          const { updated } = await save.mutateAsync({
            itemIds: [...selected.keys()],
            scheduleCodeId,
          });
          notify.success(`${updated} ${updated === 1 ? 'item' : 'items'} marked as ${label}`);
          setSelected(new Map());
        } catch (error) {
          notify.failure('Could not change the medicine type', error);
        }
      },
    });
  };

  /** @type {import('@/components/data-table/data-table').DataTableColumn[]} */
  const columns = [
    {
      id: 'select',
      header: 'Choose',
      cell: (row) => (
        <input
          type="checkbox"
          className="size-4 accent-primary"
          aria-label={`Choose ${row.name ?? row.code}`}
          checked={selected.has(row.id)}
          onChange={() => toggle(row)}
        />
      ),
    },
    { id: 'name', header: 'Item', sortable: true, cell: (row) => row.name ?? '—' },
    { id: 'code', header: 'Code', sortable: true, cell: (row) => row.code ?? '—' },
    {
      id: 'scheduleCodeId',
      header: 'Medicine type',
      cell: (row) => (row.scheduleCodeId ? (names.get(row.scheduleCodeId) ?? '—') : '—'),
    },
  ];

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Medicine types</h1>
        <p className="text-sm text-muted-foreground">
          Mark which items are prescription-only, controlled or antibiotics. The till tags them and
          asks for the prescription; controlled drugs also go in the register.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search items"
            placeholder="Search by name, code or barcode"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <NativeSelect
          aria-label="Show"
          className="w-56"
          value={params.filters.scheduleCodeId ?? ''}
          onChange={(event) => setParams({ filters: { scheduleCodeId: event.target.value } })}
        >
          <option value="">All types</option>
          {(codes.data ?? []).map((code) => (
            <option key={code.id} value={code.id}>
              {code.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div
        role="group"
        aria-label="Change the type of the chosen items"
        className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3"
      >
        <span className="text-sm font-medium">
          {selected.size} {selected.size === 1 ? 'item' : 'items'} chosen
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!pageIds.length}
          onClick={() =>
            setSelected((current) => {
              const next = new Map(current);
              for (const row of rows ?? []) {
                if (allOnPage) next.delete(row.id);
                else next.set(row.id, row.name ?? row.code ?? `Item ${row.id}`);
              }
              return next;
            })
          }
        >
          {allOnPage ? 'Unchoose this page' : 'Choose this page'}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label="New type"
            className="w-56"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Choose a type…</option>
            {(codes.data ?? []).map((code) => (
              <option key={code.id} value={code.id}>
                {code.name}
              </option>
            ))}
            <option value={NO_TYPE}>No type</option>
          </NativeSelect>
          <Button disabled={!selected.size || !type || save.isPending} onClick={apply}>
            Mark chosen items
          </Button>
        </div>
      </div>

      <DataTable
        caption="Items"
        columns={columns}
        rows={rows}
        meta={/** @type {any} */ (list.data)?.meta}
        sort={params.sort}
        onSortChange={(sort) => setParams({ sort })}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize })}
        getRowId={(row) => row.id}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={<PageState state="empty" title="No items match" description="Try another search." />}
      />
      {dialog}
    </div>
  );
}
