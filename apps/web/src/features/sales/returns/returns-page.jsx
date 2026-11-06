/* eslint-disable jsdoc/reject-any-type -- credit note rows come from the generic list API */
import { CREDIT_NOTE_STATES } from '@ihealth/shared/schemas';
import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { DataTable } from '@/components/data-table/data-table';
import { DateRangeFilter, ListSearch } from '@/components/data-table/list-filters';
import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { useListParams } from '@/hooks/use-list-params';
import { useFormat } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useResourceList } from '@/lib/resource-api';
import { cn } from '@/lib/utils';

import { SALES_LABELS } from '../labels.js';
import { NOTE_STATE_LABELS, REFUND_LABELS } from './return-labels.js';
import { openReturnReceipt, useCreditNoteUses, useReturnApprovers } from './returns-api.js';

const TAB_PARAM = 'tab';
const NOTES_TAB = 'credit-notes';
const CREDIT_NOTES = 'sales/credit-notes';
const NOTE_SORT = '-issuedOn';
const RETURNS = 'sales/returns';
const RETURN_SORT = '-at';
const NO_FILTERS = Object.freeze({});

/** How each state looks in the list. */
const STATE_STYLES = Object.freeze({
  [CREDIT_NOTE_STATES.OPEN]: 'bg-success/15 text-success',
  [CREDIT_NOTE_STATES.USED_UP]: 'bg-muted text-muted-foreground',
  [CREDIT_NOTE_STATES.EXPIRED]: 'bg-warning/25 text-foreground',
  [CREDIT_NOTE_STATES.CANCELLED]: 'bg-destructive/10 text-destructive',
});

/**
 * Sales → Returns: the returns (who returned, who approved, how the money went back), and the
 * credit notes with what is left on each.
 *
 * @returns {React.JSX.Element}
 */
export default function ReturnsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const notes = searchParams.get(TAB_PARAM) === NOTES_TAB;
  /**
   * @param {boolean} toNotes
   * @returns {void}
   */
  const show = (toNotes) =>
    setSearchParams(toNotes ? { [TAB_PARAM]: NOTES_TAB } : {}, { replace: true });

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
        <p className="text-sm text-muted-foreground">
          Goods customers brought back, and the credit notes given for them.
        </p>
      </div>
      <div role="tablist" aria-label="Returns or credit notes" className="flex gap-1 border-b">
        {[
          [false, 'Returns'],
          [true, 'Credit notes'],
        ].map(([toNotes, label]) => (
          <button
            key={String(label)}
            type="button"
            role="tab"
            aria-selected={notes === toNotes}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              notes === toNotes
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => show(Boolean(toNotes))}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{notes ? <CreditNotesTab /> : <ReturnsTab />}</div>
    </div>
  );
}

/**
 * The list's own filters: the tab lives in the address too, but it is not a filter of the list.
 *
 * @param {Record<string, string>} filters
 * @returns {Record<string, string>}
 */
const listFilters = (filters) =>
  Object.fromEntries(Object.entries(filters).filter(([name]) => name !== TAB_PARAM));

/** @returns {React.JSX.Element} */
function ReturnsTab() {
  const format = useFormat();
  const { params, setParams } = useListParams({
    defaultSort: RETURN_SORT,
    defaultFilters: NO_FILTERS,
  });
  const approvers = useReturnApprovers();
  const list = useResourceList(RETURNS, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    q: params.q,
    filters: listFilters(params.filters),
  });

  useEffect(() => {
    if (list.error) notify.failure('Could not load the returns', list.error, { id: 'returns' });
  }, [list.error]);

  /**
   * @param {number} id
   * @returns {Promise<void>}
   */
  const print = async (id) => {
    try {
      await openReturnReceipt(id);
    } catch (error) {
      notify.failure('Could not print the return receipt', error);
    }
  };

  /**
   * @param {Record<string, string | undefined>} filters
   * @returns {void}
   */
  const filter = (filters) => setParams({ filters });

  /** @type {import('@/components/data-table/data-table').DataTableColumn[]} */
  const columns = [
    {
      id: 'at',
      header: 'Returned',
      sortable: true,
      cell: (row) => format.dateTime(row.at),
    },
    { id: 'code', header: 'Return No', sortable: true, cell: (row) => row.code },
    {
      id: 'billCode',
      header: SALES_LABELS.BILL_CODE,
      cell: (row) => (
        <Link
          className="text-primary underline-offset-2 hover:underline"
          to={`/sales/history?bill=${row.billId}`}
          onClick={(event) => event.stopPropagation()}
        >
          {row.billCode ?? row.billId}
        </Link>
      ),
    },
    {
      id: 'customerName',
      header: SALES_LABELS.CUSTOMER_NAME,
      cell: (row) => (
        <span className="grid gap-0.5">
          <span>{row.customerName ?? '—'}</span>
          {row.customerPhone && (
            <span className="text-xs text-muted-foreground tabular-nums">{row.customerPhone}</span>
          )}
        </span>
      ),
    },
    {
      id: 'lineCount',
      header: 'Items',
      className: 'text-right tabular-nums',
      cell: (row) => row.lineCount,
    },
    {
      id: 'refund',
      header: 'Refund',
      sortable: true,
      className: 'text-right tabular-nums',
      cell: (row) => format.money(row.refund),
    },
    {
      id: 'refundMethod',
      header: 'As',
      cell: (row) =>
        row.refundMethod
          ? REFUND_LABELS[/** @type {keyof typeof REFUND_LABELS} */ (row.refundMethod)]
          : '—',
    },
    { id: 'reason', header: 'Reason', cell: (row) => row.reason ?? '—' },
    { id: 'requestedBy', header: 'Handled by', cell: (row) => row.requestedBy ?? '—' },
    { id: 'approvedBy', header: 'Approved by', cell: (row) => row.approvedBy ?? 'Old system' },
    {
      id: 'receipt',
      header: 'Receipt',
      cell: (row) =>
        row.hasReceipt && (
          <Button variant="ghost" size="sm" onClick={() => void print(row.id)}>
            <Printer aria-hidden="true" />
            <span className="sr-only">Print receipt of {row.code}</span>
          </Button>
        ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3">
        <ListSearch
          label="Search returns"
          placeholder="Search by bill or return number, customer name or phone"
          value={params.q}
          onSearch={(q) => setParams({ q })}
        />
        <DateRangeFilter
          id="returns"
          from={params.filters.from}
          to={params.filters.to}
          onChange={filter}
        />
        <NativeSelect
          aria-label="Refunded as"
          className="w-40"
          value={params.filters.refundMethod ?? ''}
          onChange={(event) => filter({ refundMethod: event.target.value })}
        >
          <option value="">Any refund</option>
          {Object.entries(REFUND_LABELS).map(([value, label]) => (
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
        caption="Returns"
        columns={columns}
        rows={/** @type {any} */ (list.data)?.data}
        meta={/** @type {any} */ (list.data)?.meta}
        sort={params.sort}
        onSortChange={(sort) => setParams({ sort })}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize })}
        getRowId={(row) => row.id}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={
          <PageState
            state="empty"
            title="No returns match"
            description="Returns are made from the bill, in Sales history."
          />
        }
      />
    </div>
  );
}

/** @returns {React.JSX.Element} */
function CreditNotesTab() {
  const format = useFormat();
  const { params, setParams } = useListParams({
    defaultSort: NOTE_SORT,
    defaultFilters: NO_FILTERS,
  });
  const [open, setOpen] = useState(/** @type {any | null} */ (null));

  const list = useResourceList(CREDIT_NOTES, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    q: params.q,
    filters: listFilters(params.filters),
  });
  useEffect(() => {
    if (list.error) notify.failure('Could not load the credit notes', list.error, { id: 'notes' });
  }, [list.error]);

  /** @type {import('@/components/data-table/data-table').DataTableColumn[]} */
  const columns = [
    {
      id: 'issuedOn',
      header: 'Issued',
      sortable: true,
      cell: (row) => (
        <>
          {row.issuedOn ? format.date(row.issuedOn) : '—'}
          {row.issuedBy && (
            <span className="block text-xs text-muted-foreground">by {row.issuedBy}</span>
          )}
        </>
      ),
    },
    { id: 'code', header: 'Number', sortable: true, cell: (row) => row.code },
    {
      id: 'customerName',
      header: SALES_LABELS.CUSTOMER_NAME,
      cell: (row) => row.customerName ?? '—',
    },
    { id: 'originalBillCode', header: 'Against bill', cell: (row) => row.originalBillCode ?? '—' },
    {
      id: 'amount',
      header: 'Amount',
      className: 'text-right tabular-nums',
      cell: (row) => format.money(row.amount),
    },
    {
      id: 'balance',
      header: 'Left',
      sortable: true,
      className: 'text-right tabular-nums',
      cell: (row) => format.money(row.balance),
    },
    {
      id: 'expiresOn',
      header: 'Valid until',
      cell: (row) => (row.expiresOn ? format.date(row.expiresOn) : 'No limit'),
    },
    {
      id: 'state',
      header: 'State',
      cell: (row) => (
        <span
          className={cn(
            'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
            STATE_STYLES[/** @type {keyof typeof STATE_STYLES} */ (row.state)],
          )}
        >
          {NOTE_STATE_LABELS[/** @type {keyof typeof NOTE_STATE_LABELS} */ (row.state)]}
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3">
        <ListSearch
          label="Search credit notes"
          placeholder="Search by number, customer or bill"
          value={params.q}
          onSearch={(q) => setParams({ q })}
        />
        <DateRangeFilter
          id="notes"
          from={params.filters.from}
          to={params.filters.to}
          onChange={(filters) => setParams({ filters })}
        />
        <NativeSelect
          aria-label="Show"
          className="w-48"
          value={params.filters.state ?? ''}
          onChange={(event) => setParams({ filters: { state: event.target.value } })}
        >
          <option value="">All notes</option>
          {Object.values(CREDIT_NOTE_STATES).map((state) => (
            <option key={state} value={state}>
              {NOTE_STATE_LABELS[state]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DataTable
        caption="Credit notes"
        columns={columns}
        rows={/** @type {any} */ (list.data)?.data}
        meta={/** @type {any} */ (list.data)?.meta}
        sort={params.sort}
        onSortChange={(sort) => setParams({ sort })}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize })}
        getRowId={(row) => row.id}
        onRowClick={(row) => setOpen(row)}
        isRowMuted={(row) => row.state !== CREDIT_NOTE_STATES.OPEN}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={<PageState state="empty" title="No credit notes match" />}
      />
      <CreditNoteDialog note={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/**
 * @param {{ note: any | null, onClose: () => void }} props
 * @returns {React.JSX.Element}
 */
function CreditNoteDialog({ note, onClose }) {
  const format = useFormat();
  const uses = useCreditNoteUses(note?.code ?? null);
  useEffect(() => {
    if (uses.error) notify.failure('Could not load the uses of the note', uses.error);
  }, [uses.error]);
  return (
    <Dialog open={note !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={`Credit note ${note?.code ?? ''}`}
        description={
          note
            ? `${note.customerName ?? 'No name'} · ${format.money(note.balance)} left of ${format.money(note.amount)}`
            : ''
        }
        className="max-w-xl"
      >
        {note && (
          <p className="text-sm text-muted-foreground">
            Issued by {note.issuedBy ?? 'unknown'}
            {note.issuedAt && ` on ${format.dateTime(note.issuedAt)}`}
            {note.approvedBy && `, approved by ${note.approvedBy}`}.
          </p>
        )}
        {uses.isPending ? (
          <PageState state="loading" />
        ) : (uses.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Not used yet in this app.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Times the note was used</caption>
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">{SALES_LABELS.BILL_CODE}</th>
                <th className="py-1 text-right font-medium">Used</th>
                <th className="py-1 text-right font-medium">Left after</th>
                <th className="py-1 font-medium">Handled by</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(uses.data ?? []).map((use) => (
                <tr key={`${use.billId}`}>
                  <td className="py-1.5">{format.dateTime(use.usedAt)}</td>
                  <td className="py-1.5 tabular-nums">{use.billCode ?? use.billId}</td>
                  <td className="py-1.5 text-right tabular-nums">{format.money(use.amount)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {format.money(use.balanceAfter)}
                  </td>
                  <td className="py-1.5">{use.usedBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
