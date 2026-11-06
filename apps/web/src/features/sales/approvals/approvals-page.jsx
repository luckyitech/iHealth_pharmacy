/* eslint-disable jsdoc/reject-any-type -- rows come from the approvals list API */
import { useEffect } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DateRangeFilter, ListSearch } from '@/components/data-table/list-filters';
import { PageState } from '@/components/feedback/page-state';
import { NativeSelect } from '@/components/ui/native-select';
import { useListParams } from '@/hooks/use-list-params';
import { useFormat } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useResourceList } from '@/lib/resource-api';

import { SALES_LABELS } from '../labels.js';
import { useApprovers } from '../till/till-api.js';
import { APPROVAL_KIND_LABELS, APPROVAL_REASON_TITLES } from './approval-labels.js';

const APPROVALS = 'sales/approvals';
const DEFAULT_SORT = '-at';
const NO_FILTERS = Object.freeze({});

/**
 * @param {import('../till/till-api.js').BillApproval} approval
 * @returns {string} What was approved, in words.
 */
const whatOf = (approval) =>
  approval.items.length
    ? approval.items
        .map(
          (item) =>
            `${item.reasons.map((reason) => APPROVAL_REASON_TITLES[reason]).join(', ')}: ${item.itemName ?? 'an item'}`,
        )
        .join('; ')
    : APPROVAL_KIND_LABELS[approval.kind];

/**
 * Approvals, for the people who approve: who asked, who approved, why, and how much was given away
 * below the shelf price (for a cancellation, the bill's amount). Searched and filtered like Sales
 * history.
 *
 * @returns {React.JSX.Element}
 */
export default function ApprovalsPage() {
  const format = useFormat();
  const { params, setParams } = useListParams({
    defaultSort: DEFAULT_SORT,
    defaultFilters: NO_FILTERS,
  });
  const approvers = useApprovers();
  const list = useResourceList(APPROVALS, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    q: params.q,
    filters: params.filters,
  });

  useEffect(() => {
    if (list.error) notify.failure('Could not load the approvals', list.error, { id: 'approvals' });
  }, [list.error]);

  /**
   * @param {Record<string, string | undefined>} filters
   * @returns {void}
   */
  const filter = (filters) => setParams({ filters });

  /** @type {import('@/components/data-table/data-table').DataTableColumn[]} */
  const columns = [
    { id: 'at', header: 'When', sortable: true, cell: (row) => format.instant(row.at) },
    {
      id: 'billCode',
      header: SALES_LABELS.BILL_CODE,
      cell: (row) =>
        row.used ? (
          (row.billCode ?? '—')
        ) : (
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            Not used
          </span>
        ),
    },
    {
      id: 'kind',
      header: 'What',
      cell: (row) => (
        <>
          <span className="block font-medium">
            {APPROVAL_KIND_LABELS[/** @type {keyof typeof APPROVAL_KIND_LABELS} */ (row.kind)]}
          </span>
          {row.items.length > 0 && (
            <span className="block text-xs text-muted-foreground">{whatOf(row)}</span>
          )}
        </>
      ),
    },
    { id: 'requestedBy', header: 'Asked by', cell: (row) => row.requestedBy ?? '—' },
    {
      id: 'approvedBy',
      header: 'Approved by',
      cell: (row) => row.approvedBy ?? 'Alone, within the time allowed',
    },
    { id: 'reason', header: 'Reason', cell: (row) => row.reason },
    {
      id: 'givenAway',
      header: 'Amount',
      sortable: true,
      className: 'text-right tabular-nums',
      cell: (row) => format.money(row.givenAway),
    },
  ];

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          What a second person approved: big discounts, changed prices, sales below cost, and
          cancelled bills. &quot;Not used&quot; means it was approved but the sale was never
          completed.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <ListSearch
          label="Search approvals"
          placeholder="Search by bill number, name or reason"
          value={params.q}
          onSearch={(q) => setParams({ q })}
        />
        <DateRangeFilter
          id="approvals"
          from={params.filters.from}
          to={params.filters.to}
          onChange={filter}
        />
        <NativeSelect
          aria-label="Kind"
          className="w-44"
          value={params.filters.kind ?? ''}
          onChange={(event) => filter({ kind: event.target.value })}
        >
          <option value="">Any approval</option>
          {Object.entries(APPROVAL_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Approved by"
          className="w-44"
          value={params.filters.approverId ?? ''}
          onChange={(event) => filter({ approverId: event.target.value })}
        >
          <option value="">Any approver</option>
          {(approvers.data ?? []).map((approver) => (
            <option key={approver.id} value={approver.id}>
              {approver.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <DataTable
        caption="Approvals"
        columns={columns}
        rows={/** @type {any} */ (list.data)?.data}
        meta={/** @type {any} */ (list.data)?.meta}
        sort={params.sort}
        onSortChange={(sort) => setParams({ sort })}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize })}
        getRowId={(row) => row.id}
        isRowMuted={(row) => !row.used}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={
          <PageState
            state="empty"
            title="No approvals match"
            description="Nothing needed a second person."
          />
        }
      />
    </div>
  );
}
