import { POLICIES } from '@ihealth/shared/permissions';
import { BILL_STATUSES } from '@ihealth/shared/schemas';
import { Ban, Printer, Tag, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { PageState } from '@/components/feedback/page-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAppInfo } from '@/app/use-app-info';
import { useCurrentUser } from '@/features/auth/use-auth';
import { usePermissions } from '@/features/auth/use-permissions';
import { minutesBetween, useFormat, wallClockNow } from '@/lib/format';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

import { FLAG_LABELS, METHOD_LABELS } from './bill-labels.js';
import { BillStatus } from './bill-status.jsx';
import { APPROVAL_KIND_LABELS, APPROVAL_REASON_TITLES } from '../approvals/approval-labels.js';
import { useTillSettings } from '../till/till-api.js';
import { CancelBillDialog } from './cancel-bill-dialog.jsx';
import { openReceipt, useBill } from './sales-api.js';
import { SALES_LABELS } from '../labels.js';
import { LabelsDialog } from '../labels/labels-dialog.jsx';
import { openPrescriptionPhoto } from '../prescriptions/prescriptions-api.js';

/** Shown for a bill sold without a doctor (the legacy placeholder doctor included). */
const NO_DOCTOR = 'No doctor';

/**
 * @param {{ label: string, children: React.ReactNode }} props
 * @returns {React.JSX.Element}
 */
function Fact({ label, children }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * One past bill, read-only: who and when, its items with batch and expiry, totals, payments and
 * the audit trail, with a reprint of the receipt.
 *
 * @param {{ id: number, onClose: () => void }} props
 * @returns {React.JSX.Element}
 */
export function BillDialog({ id, onClose }) {
  const bill = useBill(id);
  const format = useFormat();
  const [printing, setPrinting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const data = bill.data;
  const { hasAny } = usePermissions();
  const canSell = hasAny(POLICIES.sales.sell);
  const [labelling, setLabelling] = useState(false);
  const me = useCurrentUser().data;
  const settings = useTillSettings(canSell);
  const timeZone = useAppInfo().data?.region.timeZone;

  // Only bills of today can be cancelled; the server checks every rule again.
  const now = wallClockNow(timeZone);
  const age = data ? (minutesBetween(now, data.createdAt) ?? 0) : 0;
  const aloneMinutes = settings.data?.cancelAloneMinutes ?? 0;
  const canCancel =
    canSell &&
    Boolean(data) &&
    data?.status !== BILL_STATUSES.CANCELLED &&
    data?.billDate === now.slice(0, 10);

  useEffect(() => {
    if (bill.error) notify.failure('Could not open the bill', bill.error, { id: `bill-${id}` });
  }, [bill.error, id]);

  const reprint = async () => {
    setPrinting(true);
    try {
      await openReceipt(id);
    } catch (error) {
      notify.failure('Could not reprint the receipt', error);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={data ? `Bill ${data.code ?? `#${data.id}`}` : 'Bill'}
        description={data ? format.dateTime(data.createdAt ?? data.billDate) : undefined}
        className="flex max-h-[90dvh] max-w-[min(68rem,calc(100%-2rem))] flex-col"
      >
        {bill.isPending ? (
          <PageState state="loading" />
        ) : bill.error || !data ? (
          <PageState state="error" error={bill.error} onRetry={() => void bill.refetch()} />
        ) : (
          <div className="grid min-h-0 gap-5 overflow-y-auto pr-1">
            {data.flags.length > 0 && (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Old data to check</AlertTitle>
                <AlertDescription>
                  {data.flags
                    .map(
                      (flag) =>
                        FLAG_LABELS[/** @type {keyof typeof FLAG_LABELS} */ (flag)].description,
                    )
                    .join(' ')}
                </AlertDescription>
              </Alert>
            )}

            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Fact label="Status">
                <BillStatus status={data.status} />
              </Fact>
              <Fact label="Customer">
                {data.customerName ?? '—'}
                {data.customerPhone && (
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {data.customerPhone}
                  </span>
                )}
              </Fact>
              <Fact label="Cashier">{data.cashierName ?? '—'}</Fact>
              <Fact label="Doctor">
                {data.prescriberName ?? NO_DOCTOR}
                {data.hospitalName && (
                  <span className="block text-xs text-muted-foreground">{data.hospitalName}</span>
                )}
                {data.prescriptionDate && (
                  <span className="block text-xs text-muted-foreground">
                    Prescribed {format.date(data.prescriptionDate)}
                  </span>
                )}
                {data.hasPrescriptionPhoto && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() =>
                      openPrescriptionPhoto(data.id).catch((error) =>
                        notify.failure('Could not open the prescription photo', error),
                      )
                    }
                  >
                    View prescription photo
                  </Button>
                )}
              </Fact>
            </dl>

            <section aria-labelledby="bill-items" className="grid gap-2">
              <h3 id="bill-items" className="text-sm font-semibold">
                Items ({data.lines.length})
              </h3>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">{SALES_LABELS.BATCH_NO}</th>
                      <th className="px-3 py-2 font-medium">Expiry</th>
                      <th className="px-3 py-2 text-right font-medium">{SALES_LABELS.QTY}</th>
                      <th className="px-3 py-2 text-right font-medium">
                        {SALES_LABELS.PRICE_WITH_VAT}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {SALES_LABELS.PRICE_BEFORE_VAT}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        {SALES_LABELS.SALE_DISCOUNT}
                      </th>
                      <th className="px-3 py-2 text-right font-medium">{SALES_LABELS.TAX}</th>
                      <th className="px-3 py-2 text-right font-medium">
                        {SALES_LABELS.TOTAL_AMOUNT}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-2">
                          <span className="font-medium">{line.itemName ?? 'Item gone'}</span>
                          {line.itemCode && (
                            <span className="block text-xs text-muted-foreground">
                              {line.itemCode}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{line.batchNo ?? '—'}</td>
                        <td
                          className={cn(
                            'px-3 py-2 whitespace-nowrap tabular-nums',
                            line.expiredWhenSold && 'text-destructive',
                          )}
                        >
                          {format.date(line.expiryDate)}
                          {line.expiredWhenSold && (
                            <span className="block text-xs">Expired when sold</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.labelPrice === null ? '—' : format.money(line.labelPrice)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {format.money(line.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.discountPercent ? `${line.discountPercent}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.vatPercent ? `${line.vatPercent}%` : '—'}
                          {line.taxCode && (
                            <span className="block text-xs text-muted-foreground">
                              {line.taxCode}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {format.money(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-5 sm:grid-cols-2">
              <section aria-labelledby="bill-payments" className="grid content-start gap-2">
                <h3 id="bill-payments" className="text-sm font-semibold">
                  Payments
                </h3>
                {data.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payment recorded.</p>
                ) : (
                  <dl className="grid gap-1 text-sm">
                    {data.payments.map((payment) => (
                      <div key={payment.method} className="flex justify-between gap-3">
                        <dt>
                          {
                            METHOD_LABELS[
                              /** @type {keyof typeof METHOD_LABELS} */ (payment.method)
                            ]
                          }
                          {payment.reference && (
                            <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                              {payment.reference}
                            </span>
                          )}
                        </dt>
                        <dd className="tabular-nums">{format.money(payment.amount)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
              <section aria-labelledby="bill-totals" className="grid content-start gap-2">
                <h3 id="bill-totals" className="text-sm font-semibold">
                  Totals
                </h3>
                <dl className="grid gap-1 text-sm">
                  {[
                    [SALES_LABELS.TOTAL_AMOUNT, data.totals.gross],
                    [SALES_LABELS.TOTAL_DISCOUNT, data.totals.discount],
                    [SALES_LABELS.VAT, data.totals.vat],
                    [SALES_LABELS.ROUND_OFF, data.totals.roundedOff],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="tabular-nums">{format.money(value)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 border-t pt-1 font-semibold">
                    <dt>{SALES_LABELS.NET_AMOUNT}</dt>
                    <dd className="tabular-nums">{format.money(data.totals.net)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{SALES_LABELS.AMOUNT_PAID}</dt>
                    <dd className="tabular-nums">{format.money(data.totals.paid)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{SALES_LABELS.BALANCE}</dt>
                    <dd className="tabular-nums">{format.money(data.totals.balance)}</dd>
                  </div>
                </dl>
              </section>
            </div>

            {data.approvals.length > 0 && (
              <section aria-labelledby="bill-approvals" className="grid gap-2">
                <h3 id="bill-approvals" className="text-sm font-semibold">
                  Approvals and changes
                </h3>
                <ul className="divide-y rounded-md border text-sm">
                  {data.approvals.map((approval) => (
                    <li key={approval.id} className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2">
                      <span className="text-muted-foreground tabular-nums">
                        {format.time(approval.at)}
                      </span>
                      <span>
                        <span className="font-medium">
                          {APPROVAL_KIND_LABELS[approval.kind]}
                          {approval.items.length > 0 &&
                            `: ${approval.items
                              .map(
                                (item) =>
                                  `${item.reasons.map((reason) => APPROVAL_REASON_TITLES[reason]).join(', ')} on ${item.itemName ?? 'an item'}`,
                              )
                              .join('; ')}`}
                        </span>{' '}
                        asked by {approval.requestedBy ?? 'unknown'}
                        {approval.approvedBy
                          ? `, approved by ${approval.approvedBy}`
                          : ', within the time allowed alone'}
                        . Reason: {approval.reason}.
                        {Number(approval.givenAway) > 0 && approval.kind !== 'cancel' && (
                          <span className="text-muted-foreground">
                            {' '}
                            Given away {format.money(approval.givenAway)}.
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section
              aria-labelledby="bill-audit"
              className="grid gap-1 text-xs text-muted-foreground"
            >
              <h3 id="bill-audit" className="sr-only">
                History
              </h3>
              <p>
                Made by {data.audit.createdBy ?? 'unknown'} on{' '}
                {format.dateTime(data.audit.createdAt)}. Last changed by{' '}
                {data.audit.updatedBy ?? 'unknown'} on {format.dateTime(data.audit.updatedAt)}.
              </p>
              {data.remarks && <p>Remarks: {data.remarks}</p>}
            </section>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {canCancel && (
            <Button
              variant="outline"
              className="text-destructive sm:mr-auto"
              onClick={() => setCancelling(true)}
            >
              <Ban aria-hidden="true" /> Cancel bill
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {data && canSell && data.status !== BILL_STATUSES.CANCELLED && (
            <Button variant="outline" onClick={() => setLabelling(true)}>
              <Tag aria-hidden="true" /> Labels
            </Button>
          )}
          <Button onClick={reprint} disabled={!data || printing}>
            <Printer aria-hidden="true" />
            {printing ? 'Preparing…' : 'Reprint receipt'}
          </Button>
        </div>
      </DialogContent>
      <LabelsDialog
        billId={labelling && data ? data.id : null}
        onClose={() => setLabelling(false)}
      />
      {data && canCancel && (
        <CancelBillDialog
          bill={data}
          open={cancelling}
          onOpenChange={setCancelling}
          rules={{
            alone: me?.employeeId === data.cashierId && age <= aloneMinutes,
            ageMinutes: Math.max(age, 0),
            aloneMinutes,
            quickReasons: settings.data?.cancelReasons ?? [],
          }}
        />
      )}
    </Dialog>
  );
}
