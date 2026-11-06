/* eslint-disable jsdoc/reject-any-type -- credit note rows come from the generic list API */
import { CREDIT_NOTE_STATES } from '@ihealth/shared/schemas';
import { Printer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useAppInfo } from '@/app/use-app-info';
import { DataTable } from '@/components/data-table/data-table';
import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useListParams } from '@/hooks/use-list-params';
import { useFormat, wallClockNow } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useResourceList } from '@/lib/resource-api';
import { cn } from '@/lib/utils';

import { SALES_LABELS } from '../labels.js';
import { NOTE_STATE_LABELS, REFUND_LABELS } from './return-labels.js';
import { openReturnReceipt, useCreditNoteUses, useReturnsOfDay } from './returns-api.js';

const TAB_PARAM = 'tab';
const NOTES_TAB = 'credit-notes';
const CREDIT_NOTES = 'sales/credit-notes';
const NOTE_SORT = '-issuedOn';
const NO_FILTERS = Object.freeze({});

/** How each state looks in the list. */
const STATE_STYLES = Object.freeze({
  [CREDIT_NOTE_STATES.OPEN]: 'bg-success/15 text-success',
  [CREDIT_NOTE_STATES.USED_UP]: 'bg-muted text-muted-foreground',
  [CREDIT_NOTE_STATES.EXPIRED]: 'bg-warning/25 text-foreground',
  [CREDIT_NOTE_STATES.CANCELLED]: 'bg-destructive/10 text-destructive',
});

/**
 * Sales → Returns: the day's returns (who returned, who approved, how the money went back), and the
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

/** @returns {React.JSX.Element} */
function ReturnsTab() {
  const format = useFormat();
  const today = wallClockNow(useAppInfo().data?.region.timeZone).slice(0, 10);
  const [date, setDate] = useState(today);
  const returns = useReturnsOfDay(date);

  useEffect(() => {
    if (returns.error)
      notify.failure('Could not load the returns', returns.error, { id: 'returns' });
  }, [returns.error]);

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

  const rows = returns.data ?? [];
  return (
    <div className="grid gap-4">
      <div className="grid w-44 gap-1.5">
        <Label htmlFor="returns-date">Day</Label>
        <Input
          id="returns-date"
          type="date"
          max={today}
          value={date}
          onChange={(event) => setDate(event.target.value || today)}
        />
      </div>
      {returns.isLoading ? (
        <PageState state="loading" />
      ) : rows.length === 0 ? (
        <PageState
          state="empty"
          title="No returns that day"
          description="Returns are made from the bill, in Sales history."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Returns of {format.date(date)}</caption>
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Return No</th>
                <th className="px-3 py-2 font-medium">{SALES_LABELS.BILL_CODE}</th>
                <th className="px-3 py-2 font-medium">{SALES_LABELS.CUSTOMER_NAME}</th>
                <th className="px-3 py-2 text-right font-medium">Items</th>
                <th className="px-3 py-2 text-right font-medium">Refund</th>
                <th className="px-3 py-2 font-medium">As</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Returned by</th>
                <th className="px-3 py-2 font-medium">Approved by</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Receipt</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 tabular-nums">{row.at ? format.time(row.at) : '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{row.code}</td>
                  <td className="px-3 py-2 tabular-nums">
                    <Link
                      className="text-primary underline-offset-2 hover:underline"
                      to={`/sales/history?bill=${row.billId}`}
                    >
                      {row.billCode ?? row.billId}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.customerName ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.lineCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{format.money(row.refund)}</td>
                  <td className="px-3 py-2">
                    {row.refundMethod ? REFUND_LABELS[row.refundMethod] : '—'}
                  </td>
                  <td className="px-3 py-2">{row.reason ?? '—'}</td>
                  <td className="px-3 py-2">{row.requestedBy ?? '—'}</td>
                  <td className="px-3 py-2">{row.approvedBy ?? 'Old system'}</td>
                  <td className="px-3 py-2 text-right">
                    {row.hasReceipt && (
                      <Button variant="ghost" size="sm" onClick={() => void print(row.id)}>
                        <Printer aria-hidden="true" />
                        <span className="sr-only">Print receipt of {row.code}</span>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  const [search, setSearch] = useState(params.q);
  const debounced = useDebouncedValue(search);
  const [open, setOpen] = useState(/** @type {any | null} */ (null));

  useEffect(() => {
    if (debounced !== params.q) setParams({ q: debounced });
  }, [debounced, params.q, setParams]);

  const list = useResourceList(CREDIT_NOTES, {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    q: params.q,
    // The tab lives in the address too; it is not a filter of the list.
    filters: Object.fromEntries(
      Object.entries(params.filters).filter(([name]) => name !== TAB_PARAM),
    ),
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
      cell: (row) => (row.issuedOn ? format.date(row.issuedOn) : '—'),
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
        <div className="relative min-w-56 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search credit notes"
            placeholder="Search by number, customer or bill"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
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
                <th className="py-1 font-medium">By</th>
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
