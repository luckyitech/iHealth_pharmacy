import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { useAppInfo } from '@/app/use-app-info';
import { DateRangeFilter } from '@/components/data-table/list-filters';
import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { HistoryList } from '@/features/activity/history-list';
import { useFormat, wallClockNow } from '@/lib/format';
import { notify } from '@/lib/notify';

import { SALES_LABELS } from '../labels.js';
import { openRegisterPdf, useControlledItems, useControlledRegister } from './register-api.js';
import { ENTRY_LABELS } from './register-labels.js';

/** The register opens on the current month. */
const FIRST_OF_MONTH = '-01';

/**
 * Sales → Controlled-drug register: one controlled drug at a time, every unit in and out over a
 * period, who it went to and on whose prescription, with a running balance. Printable for the
 * inspector.
 *
 * @returns {React.JSX.Element}
 */
export default function ControlledRegisterPage() {
  const format = useFormat();
  const today = wallClockNow(useAppInfo().data?.region.timeZone).slice(0, 10);
  const [itemId, setItemId] = useState('');
  const [from, setFrom] = useState(today.slice(0, 7) + FIRST_OF_MONTH);
  const [to, setTo] = useState(today);
  const items = useControlledItems();
  const query = itemId && from && to && from <= to ? { itemId: Number(itemId), from, to } : null;
  const register = useControlledRegister(query);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (items.error)
      notify.failure('Could not load the controlled drugs', items.error, {
        id: 'controlled-items',
      });
  }, [items.error]);
  useEffect(() => {
    if (register.error)
      notify.failure('Could not load the register', register.error, { id: 'controlled-register' });
  }, [register.error]);

  const print = async () => {
    if (!query) return;
    setPrinting(true);
    try {
      await openRegisterPdf(query);
    } catch (error) {
      notify.failure('Could not print the register', error);
    } finally {
      setPrinting(false);
    }
  };

  const data = register.data;
  const totals = (data?.entries ?? []).reduce(
    (sum, entry) => ({ in: sum.in + entry.quantityIn, out: sum.out + entry.quantityOut }),
    { in: 0, out: 0 },
  );

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Controlled-drug register</h1>
        <p className="text-sm text-muted-foreground">
          Every unit of a controlled drug that came in or went out, who it went to and on whose
          prescription, with the balance after each.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="Medicine"
          className="min-w-64 flex-1"
          value={itemId}
          disabled={items.isPending}
          onChange={(event) => setItemId(event.target.value)}
        >
          <option value="">Choose a controlled drug…</option>
          {(items.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.onHand} on hand
            </option>
          ))}
        </NativeSelect>
        <DateRangeFilter
          id="register"
          from={from}
          to={to}
          onChange={(change) => {
            if (change.from !== undefined) setFrom(change.from);
            if (change.to !== undefined) setTo(change.to);
          }}
        />
        <Button variant="outline" disabled={!data || printing} onClick={() => void print()}>
          <Printer aria-hidden="true" /> Print
        </Button>
      </div>

      {!query ? (
        <PageState
          state="empty"
          title={items.data?.length === 0 ? 'No controlled drugs yet' : 'Choose a controlled drug'}
          description={
            items.data?.length === 0
              ? 'Mark them under Masters → Medicine types.'
              : 'Its register for the dates chosen appears here.'
          }
        />
      ) : register.isPending ? (
        <PageState state="loading" />
      ) : data ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Opening balance', data.opening],
              ['In', totals.in],
              ['Out', totals.out],
              ['Closing balance', data.closing],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {data.entries.length === 0 ? (
            <PageState
              state="empty"
              title="No movements in this period"
              description={`The balance stayed at ${data.opening}.`}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Register of {data.item.name}, {format.date(data.from)} to {format.date(data.to)}
                </caption>
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Entry</th>
                    <th className="px-3 py-2 font-medium">Bill / invoice</th>
                    <th className="px-3 py-2 font-medium">{SALES_LABELS.BATCH_NO}</th>
                    <th className="px-3 py-2 font-medium">Patient</th>
                    <th className="px-3 py-2 font-medium">Doctor</th>
                    <th className="px-3 py-2 text-right font-medium">In</th>
                    <th className="px-3 py-2 text-right font-medium">Out</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-3 py-2 font-medium">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr className="text-muted-foreground">
                    <td className="px-3 py-2 tabular-nums">{format.date(data.from)}</td>
                    <td className="px-3 py-2" colSpan={7}>
                      Opening balance
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {data.opening}
                    </td>
                    <td />
                  </tr>
                  {data.entries.map((entry, index) => (
                    <tr key={`${entry.at}-${index}`}>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {format.date(entry.at.slice(0, 10))}{' '}
                        <span className="text-muted-foreground">{entry.at.slice(11, 16)}</span>
                      </td>
                      <td className="px-3 py-2">{entry.entryType ?? ENTRY_LABELS[entry.kind]}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {entry.billId ? (
                          <Link
                            className="text-primary underline-offset-2 hover:underline"
                            to={`/sales/history?bill=${entry.billId}`}
                          >
                            {entry.billCode ?? entry.billId}
                          </Link>
                        ) : (
                          (entry.invoiceNo ?? '—')
                        )}
                      </td>
                      <td className="px-3 py-2">{entry.batchNo ?? '—'}</td>
                      <td className="px-3 py-2">
                        {entry.patientName ?? '—'}
                        {entry.patientIdNumber && (
                          <span className="block text-xs text-muted-foreground">
                            ID {entry.patientIdNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{entry.doctorName ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {entry.quantityIn || ''}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {entry.quantityOut || ''}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {entry.balance}
                      </td>
                      <td className="px-3 py-2">{entry.by ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
      <div className="max-h-80 overflow-y-auto rounded-md border p-4">
        <HistoryList
          path="sales/controlled-register/history"
          title="Who read or printed the register"
          empty="Nobody has read or printed it in the new system yet."
        />
      </div>
    </div>
  );
}
