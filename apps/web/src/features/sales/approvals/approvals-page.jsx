import { useEffect, useState } from 'react';

import { PageState } from '@/components/feedback/page-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppInfo } from '@/app/use-app-info';
import { useFormat, wallClockNow } from '@/lib/format';
import { notify } from '@/lib/notify';

import { SALES_LABELS } from '../labels.js';
import { useApprovalsOfDay } from '../till/till-api.js';
import { APPROVAL_KIND_LABELS, APPROVAL_REASON_TITLES } from './approval-labels.js';

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
 * The day's approvals for the people who approve: who asked, who approved, why, and how much was
 * given away below the shelf price (for a cancellation, the bill's amount).
 *
 * @returns {React.JSX.Element}
 */
export default function ApprovalsPage() {
  const format = useFormat();
  const timeZone = useAppInfo().data?.region.timeZone;
  const today = wallClockNow(timeZone).slice(0, 10);
  const [date, setDate] = useState(today);
  const approvals = useApprovalsOfDay(date);

  useEffect(() => {
    if (approvals.error)
      notify.failure('Could not load the approvals', approvals.error, { id: 'approvals' });
  }, [approvals.error]);

  const rows = approvals.data ?? [];
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
          <p className="text-sm text-muted-foreground">
            What a second person approved: big discounts, changed prices, sales below cost, and
            cancelled bills. "Not used" means it was approved but the sale was never completed.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="approvals-date">Day</Label>
          <Input
            id="approvals-date"
            type="date"
            className="w-44"
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value || today)}
          />
        </div>
      </div>

      {approvals.isLoading ? (
        <PageState state="loading" />
      ) : rows.length === 0 ? (
        <PageState
          state="empty"
          title="No approvals that day"
          description="Nothing needed a second person."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Approvals of {format.date(date)}</caption>
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">{SALES_LABELS.BILL_CODE}</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 font-medium">Asked by</th>
                <th className="px-3 py-2 font-medium">Approved by</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((approval) => (
                <tr key={approval.id}>
                  <td className="px-3 py-2 tabular-nums">{format.time(approval.at)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {approval.used ? (
                      (approval.billCode ?? '—')
                    ) : (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        Not used
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="block font-medium">{APPROVAL_KIND_LABELS[approval.kind]}</span>
                    {approval.items.length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {whatOf(approval)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{approval.requestedBy ?? '—'}</td>
                  <td className="px-3 py-2">
                    {approval.approvedBy ?? 'Alone, within the time allowed'}
                  </td>
                  <td className="px-3 py-2">{approval.reason}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {format.money(approval.givenAway)}
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
