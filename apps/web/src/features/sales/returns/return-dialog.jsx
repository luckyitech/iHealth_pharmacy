import { REFUND_METHODS, RETURN_CONDITIONS } from '@ihealth/shared/schemas';
import { Loader2, Minus, Plus, Printer } from 'lucide-react';
import { useState } from 'react';

import { PageState } from '@/components/feedback/page-state';
import { FormField } from '@/components/form/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SHEET_ON_PHONE } from '@/components/ui/dialog-variants';
import { Input } from '@/components/ui/input';
import { isApiError } from '@/lib/api-error';
import { useFormat } from '@/lib/format';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

import { approvalErrorsOf, missingApproval } from '../approvals/approval-entry.js';
import { ApproverFields, ReasonField } from '../approvals/approval-fields.jsx';
import { SALES_LABELS } from '../labels.js';
import { useTillSettings } from '../till/till-api.js';
import { REFUND_LABELS } from './return-labels.js';
import { openReturnReceipt, useReturnableBill, useReturnGoods } from './returns-api.js';

/**
 * Returning goods from a bill: how many of each line, whether they go back on the shelf, the
 * reason, how the money goes back, and a second person's approval. Then the receipt.
 *
 * @param {object} props
 * @param {number | null} props.billId Null while closed.
 * @param {() => void} props.onClose
 * @returns {React.JSX.Element}
 */
export function ReturnDialog({ billId, onClose }) {
  const [done, setDone] = useState(
    /** @type {import('./returns-api.js').CompletedReturn | null} */ (null),
  );
  const close = () => {
    setDone(null);
    onClose();
  };
  return (
    <Dialog open={billId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent
        title={done ? 'Return done' : 'Return items'}
        description={done ? done.code : 'What comes back, and how the money goes back.'}
        className={cn('max-w-3xl', SHEET_ON_PHONE)}
      >
        {billId !== null &&
          (done ? (
            <ReturnDone done={done} onClose={close} />
          ) : (
            <ReturnForm billId={billId} onDone={setDone} onCancel={close} />
          ))}
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param {{ billId: number, onDone: (done: import('./returns-api.js').CompletedReturn) => void, onCancel: () => void }} props
 * @returns {React.JSX.Element}
 */
function ReturnForm({ billId, onDone, onCancel }) {
  const format = useFormat();
  const bill = useReturnableBill(billId);
  const settings = useTillSettings();
  const save = useReturnGoods();
  const [lines, setLines] = useState(
    /** @type {Record<number, { quantity: number, condition: string }>} */ ({}),
  );
  const [entry, setEntry] = useState({ reason: '', approver: '', pin: '' });
  const [refund, setRefund] = useState('');
  const [mpesaCode, setMpesaCode] = useState('');
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState(/** @type {Record<string, string>} */ ({}));

  if (bill.isPending) return <PageState state="loading" />;
  if (!bill.data)
    return <PageState state="error" error={bill.error} onRetry={() => void bill.refetch()} />;
  if (bill.data.blocked)
    return (
      <div className="grid gap-4">
        <Alert>
          <AlertDescription>{bill.data.blocked}.</AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    );

  const data = bill.data;
  const chosen = data.lines.filter((line) => (lines[line.lineId]?.quantity ?? 0) > 0);
  const total = chosen.reduce(
    (sum, line) => sum + Number(line.unitRefund) * lines[line.lineId].quantity,
    0,
  );
  const units = chosen.reduce((sum, line) => sum + lines[line.lineId].quantity, 0);
  const missing = {
    ...missingApproval(entry, { needApprover: true }),
    ...(refund ? {} : { refund: 'Choose how the money goes back' }),
    ...(refund === REFUND_METHODS.MPESA && !mpesaCode.trim()
      ? { mpesaCode: 'Enter the code of the M-Pesa payment sent back' }
      : {}),
  };
  const errors = { ...(tried ? missing : {}), ...serverErrors };

  /**
   * @param {number} lineId
   * @param {Partial<{ quantity: number, condition: string }>} change
   * @returns {void}
   */
  const setLine = (lineId, change) =>
    setLines((current) => ({
      ...current,
      [lineId]: {
        ...(current[lineId] ?? { quantity: 0, condition: RETURN_CONDITIONS.RESTOCK }),
        ...change,
      },
    }));

  /**
   * @param {React.FormEvent} event
   * @returns {void}
   */
  const submit = (event) => {
    event.preventDefault();
    setTried(true);
    if (!chosen.length) {
      notify.info('Choose how many of an item come back.');
      return;
    }
    if (Object.keys(missing).length || save.isPending) return;
    save.mutate(
      {
        billId,
        lines: chosen.map((line) => ({ lineId: line.lineId, ...lines[line.lineId] })),
        reason: entry.reason.trim(),
        refund,
        ...(refund === REFUND_METHODS.MPESA ? { mpesaCode: mpesaCode.trim() } : {}),
        approver: entry.approver.trim(),
        pin: entry.pin,
      },
      {
        onSuccess: (result) => {
          notify.success(
            `Returned: ${format.money(result.refund)} as ${REFUND_LABELS[result.refundMethod].toLowerCase()}`,
          );
          onDone(result);
        },
        onError: (error) => {
          const details = isApiError(error) ? (error.details ?? []) : [];
          setServerErrors({
            ...approvalErrorsOf(error),
            ...Object.fromEntries(
              details
                .filter((detail) => detail.path === 'body.mpesaCode')
                .map((detail) => ['mpesaCode', detail.message]),
            ),
          });
          notify.failure('Could not return the items', error, {
            description: details.length
              ? details.map((detail) => detail.message).join('. ')
              : undefined,
          });
        },
      },
    );
  };

  return (
    <form className="grid gap-4" noValidate onSubmit={submit}>
      <p className="text-sm text-muted-foreground">
        {SALES_LABELS.BILL_CODE} {data.billCode ?? data.billId}
        {data.billDate && ` · ${format.date(data.billDate)}`}
        {data.customerName && ` · ${data.customerName}`} · {data.daysSince}{' '}
        {data.daysSince === 1 ? 'day' : 'days'} ago (returns allowed for {data.returnDays})
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <caption className="sr-only">What comes back</caption>
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 text-right font-medium">Can return</th>
              <th className="px-3 py-2 font-medium">Return</th>
              <th className="px-3 py-2 font-medium">Condition</th>
              <th className="px-3 py-2 text-right font-medium">Refund</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.lines.map((line) => {
              const current = lines[line.lineId] ?? {
                quantity: 0,
                condition: RETURN_CONDITIONS.RESTOCK,
              };
              const name = line.itemName ?? 'This item';
              return (
                <tr
                  key={line.lineId}
                  className={cn(line.returnable === 0 && 'text-muted-foreground')}
                >
                  <td className="px-3 py-2">
                    <span className="block font-medium">{name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {SALES_LABELS.BATCH_NO} {line.batchNo ?? '—'} · {line.sold} sold
                      {line.returned > 0 && ` · ${line.returned} returned before`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.returnable}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center overflow-hidden rounded-md border bg-background">
                      <button
                        type="button"
                        className="grid size-8 place-items-center hover:bg-accent disabled:opacity-40"
                        aria-label={`One fewer ${name}`}
                        disabled={current.quantity === 0}
                        onClick={() => setLine(line.lineId, { quantity: current.quantity - 1 })}
                      >
                        <Minus aria-hidden="true" className="size-4" />
                      </button>
                      <output
                        aria-label={`${name} to return`}
                        className="w-9 text-center font-semibold tabular-nums"
                      >
                        {current.quantity}
                      </output>
                      <button
                        type="button"
                        className="grid size-8 place-items-center hover:bg-accent disabled:opacity-40"
                        aria-label={`One more ${name}`}
                        disabled={current.quantity >= line.returnable}
                        onClick={() => setLine(line.lineId, { quantity: current.quantity + 1 })}
                      >
                        <Plus aria-hidden="true" className="size-4" />
                      </button>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {current.quantity > 0 && (
                      <div
                        className="inline-flex overflow-hidden rounded-md border text-xs font-medium"
                        role="group"
                        aria-label={`Condition of ${name}`}
                      >
                        {[
                          [RETURN_CONDITIONS.RESTOCK, 'Back on the shelf'],
                          [RETURN_CONDITIONS.WRITE_OFF, "Don't restock"],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={current.condition === value}
                            className={cn(
                              'px-2.5 py-1.5',
                              current.condition === value &&
                                (value === RETURN_CONDITIONS.RESTOCK
                                  ? 'bg-success/15 text-success'
                                  : 'bg-destructive/10 text-destructive'),
                            )}
                            onClick={() => setLine(line.lineId, { condition: value })}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {current.quantity > 0
                      ? format.money(Number(line.unitRefund) * current.quantity)
                      : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReasonField
        value={entry.reason}
        onChange={(reason) => setEntry((current) => ({ ...current, reason }))}
        quickReasons={settings.data?.returnReasons ?? []}
        error={errors.reason}
      />

      <FormField label="Give the money back as" required error={errors.refund}>
        {(control) => (
          <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby={control.id}>
            {Object.values(REFUND_METHODS).map((method) => (
              <button
                key={method}
                type="button"
                aria-pressed={refund === method}
                className={cn(
                  'h-11 rounded-md border border-dashed text-sm font-medium',
                  refund === method && 'border-solid border-primary bg-accent text-primary',
                )}
                onClick={() => setRefund(method)}
              >
                {REFUND_LABELS[method]}
              </button>
            ))}
          </div>
        )}
      </FormField>
      {refund === REFUND_METHODS.MPESA && (
        <FormField label="Code of the M-Pesa payment sent back" required error={errors.mpesaCode}>
          {(control) => (
            <Input
              {...control}
              className="sm:max-w-60 uppercase"
              value={mpesaCode}
              onChange={(event) => setMpesaCode(event.target.value)}
            />
          )}
        </FormField>
      )}
      {refund === REFUND_METHODS.CREDIT_NOTE && !data.customerName && (
        <p className="text-sm text-muted-foreground">
          The bill has no customer name, so the credit note will be for whoever holds its number.
        </p>
      )}

      <ApproverFields
        value={entry}
        onChange={(change) => setEntry((current) => ({ ...current, ...change }))}
        errors={errors}
      />

      <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-col gap-3 border-t bg-card px-6 py-4 sm:flex-row sm:items-center">
        <p className="text-base font-semibold sm:mr-auto">
          Refund · {units} {units === 1 ? 'unit' : 'units'}{' '}
          <span className="tabular-nums">{format.money(total)}</span>
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onCancel}>
            Back
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
            Approve and return
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * @param {{ done: import('./returns-api.js').CompletedReturn, onClose: () => void }} props
 * @returns {React.JSX.Element}
 */
function ReturnDone({ done, onClose }) {
  const format = useFormat();
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    setPrinting(true);
    try {
      await openReturnReceipt(done.id);
    } catch (error) {
      notify.failure('Could not print the return receipt', error);
    } finally {
      setPrinting(false);
    }
  };
  return (
    <div className="grid gap-4 text-center">
      <p className="text-4xl font-extrabold tracking-tight tabular-nums">
        Refund {format.money(done.refund)}
      </p>
      <p className="text-sm text-muted-foreground">
        As {REFUND_LABELS[done.refundMethod].toLowerCase()} · approved by {done.approvedBy}
      </p>
      {done.creditNote && (
        <div className="mx-auto grid gap-1 rounded-lg border bg-muted/30 px-5 py-3">
          <span className="text-xs text-muted-foreground">Credit note</span>
          <span className="font-mono text-lg font-semibold">{done.creditNote.code}</span>
          {done.creditNote.expiresOn && (
            <span className="text-xs text-muted-foreground">
              Valid until {format.date(done.creditNote.expiresOn)}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button disabled={printing} onClick={() => void print()}>
          <Printer aria-hidden="true" /> Print receipt
        </Button>
      </div>
    </div>
  );
}
