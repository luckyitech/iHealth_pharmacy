/* eslint-disable jsdoc/reject-any-type -- rows come from the bills API schema */
import { BILL_STATUSES } from '@ihealth/shared/schemas';
import { Search, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table/data-table';
import { PageState } from '@/components/feedback/page-state';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useListParams } from '@/hooks/use-list-params';
import { useFormat } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useResourceList } from '@/lib/resource-api';

import { BillDialog } from './bill-dialog.jsx';
import { BillStatus } from './bill-status.jsx';
import { FLAG_LABELS, METHOD_LABELS, optionsOf, STATUS_LABELS } from './bill-labels.js';
import { BILLS, useCashiers } from './sales-api.js';

/** URL parameter of the bill open in the dialog. */
const BILL_PARAM = 'bill';
const DEFAULT_SORT = '-billDate';
const NO_FILTERS = Object.freeze({});

/**
 * Past bills: search by bill number, customer name or phone; filter by dates, cashier, payment and
 * status; open a bill to see its lines and payments, and reprint its receipt.
 *
 * @returns {React.JSX.Element}
 */
export default function SalesHistoryPage() {
  const format = useFormat();
  const { params, setParams } = useListParams({
    defaultSort: DEFAULT_SORT,
    defaultFilters: NO_FILTERS,
  });
  const [search, setSearch] = useState(params.q);
  const debouncedSearch = useDebouncedValue(search);
  const [searchParams, setSearchParams] = useSearchParams();
  const cashiers = useCashiers();

  useEffect(() => {
    if (debouncedSearch !== params.q) setParams({ q: debouncedSearch });
  }, [debouncedSearch, params.q, setParams]);

  const list = useResourceList(BILLS, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    q: params.q,
    filters: params.filters,
  });

  useEffect(() => {
    if (list.error) notify.failure('Could not load the bills', list.error, { id: 'bills-list' });
  }, [list.error]);
  useEffect(() => {
    if (cashiers.error)
      notify.failure('Could not load the cashier list', cashiers.error, { id: 'cashiers' });
  }, [cashiers.error]);

  const openBill = searchParams.get(BILL_PARAM);
  const openId = openBill ? Number(openBill) : undefined;

  /**
   * @param {number | null} id
   * @returns {void}
   */
  const setOpenBill = (id) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id === null) next.delete(BILL_PARAM);
        else next.set(BILL_PARAM, String(id));
        return next;
      },
      { replace: true },
    );

  /**
   * @param {Record<string, string | undefined>} filters
   * @returns {void}
   */
  const filter = (filters) => setParams({ filters });
  const filtered = Object.keys(params.filters).length > 0 || Boolean(params.q);

  /** @type {import('@/components/data-table/data-table').DataTableColumn[]} */
  const columns = [
    {
      id: 'code',
      header: 'Bill',
      sortable: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          <span className="font-medium tabular-nums">{row.code ?? `#${row.id}`}</span>
          {row.flags.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <TriangleAlert aria-hidden="true" className="size-3" />
              {row.flags
                .map(
                  (/** @type {string} */ flag) =>
                    FLAG_LABELS[/** @type {keyof typeof FLAG_LABELS} */ (flag)].label,
                )
                .join(', ')}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'billDate',
      header: 'Date',
      sortable: true,
      cell: (row) => format.dateTime(row.createdAt ?? row.billDate),
    },
    {
      id: 'customerName',
      header: 'Customer',
      cell: (row) => (
        <span className="grid gap-0.5">
          <span>{row.customerName ?? '—'}</span>
          {row.customerPhone && (
            <span className="text-xs text-muted-foreground tabular-nums">{row.customerPhone}</span>
          )}
        </span>
      ),
    },
    { id: 'cashierName', header: 'Cashier', cell: (row) => row.cashierName ?? '—' },
    {
      id: 'paymentMethods',
      header: 'Paid by',
      cell: (row) =>
        row.paymentMethods.length
          ? row.paymentMethods
              .map(
                (/** @type {string} */ method) =>
                  METHOD_LABELS[/** @type {keyof typeof METHOD_LABELS} */ (method)],
              )
              .join(' + ')
          : '—',
    },
    {
      id: 'netAmount',
      header: 'Net',
      sortable: true,
      className: 'text-right tabular-nums',
      cell: (row) => format.money(row.netAmount),
    },
    { id: 'status', header: 'Status', cell: (row) => <BillStatus status={row.status} /> },
  ];

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales history</h1>
        <p className="text-sm text-muted-foreground">
          Every bill, newest first. Open one to see its items and payments, or to reprint the
          receipt.
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
            aria-label="Search bills"
            placeholder="Search by bill number, customer name or phone"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <label htmlFor="bills-from">From</label>
          <Input
            id="bills-from"
            type="date"
            className="w-40"
            value={params.filters.from ?? ''}
            max={params.filters.to}
            onChange={(event) => filter({ from: event.target.value })}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <label htmlFor="bills-to">To</label>
          <Input
            id="bills-to"
            type="date"
            className="w-40"
            value={params.filters.to ?? ''}
            min={params.filters.from}
            onChange={(event) => filter({ to: event.target.value })}
          />
        </div>
        <NativeSelect
          aria-label="Cashier"
          className="w-44"
          value={params.filters.cashierId ?? ''}
          onChange={(event) => filter({ cashierId: event.target.value })}
        >
          <option value="">All cashiers</option>
          {(cashiers.data ?? []).map((cashier) => (
            <option key={cashier.id} value={cashier.id}>
              {cashier.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Paid by"
          className="w-40"
          value={params.filters.paymentMethod ?? ''}
          onChange={(event) => filter({ paymentMethod: event.target.value })}
        >
          <option value="">Any payment</option>
          {optionsOf(METHOD_LABELS).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Status"
          className="w-40"
          value={params.filters.status ?? ''}
          onChange={(event) => filter({ status: event.target.value })}
        >
          <option value="">Any status</option>
          {optionsOf(STATUS_LABELS).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <DataTable
        caption="Bills"
        columns={columns}
        rows={/** @type {any} */ (list.data)?.data}
        meta={/** @type {any} */ (list.data)?.meta}
        sort={params.sort}
        onSortChange={(sort) => setParams({ sort })}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize })}
        getRowId={(row) => row.id}
        onRowClick={(row) => setOpenBill(row.id)}
        isRowMuted={(row) => row.status === BILL_STATUSES.CANCELLED}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={
          <PageState
            state="empty"
            title={filtered ? 'No bills match' : 'No bills yet'}
            description={filtered ? 'Try another search, dates or filter.' : undefined}
          />
        }
      />

      {openId !== undefined && (
        <BillDialog key={openId} id={openId} onClose={() => setOpenBill(null)} />
      )}
    </div>
  );
}
