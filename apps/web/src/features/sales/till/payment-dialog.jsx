import { Loader2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

import { previewPayment, quickAmounts } from './payment.js';
import { KEY_LABELS } from './till-keys.js';

/** Ways of paying that come in a later step, shown so people know they are coming. */
const LATER = Object.freeze(['Card', 'Credit']);

/**
 * @typedef {Partial<Record<'cash' | 'mpesa' | 'code', string>>} PaymentErrors
 */

/**
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.label
 * @param {string | undefined} props.error
 * @param {React.ComponentProps<typeof Input>} props.input
 * @returns {React.JSX.Element}
 */
function AmountField({ id, label, error, input }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className="h-11 text-lg tabular-nums md:text-lg"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Taking the money: cash, M-Pesa, or both. Opens with the exact cash amount filled in, so Enter
 * completes a cash sale at once. The change shows while typing.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.net
 * @param {string} props.summary e.g. "Walk-in · 3 lines"
 * @param {readonly number[]} props.notes Bank notes for the quick amounts.
 * @param {boolean} props.pending
 * @param {PaymentErrors} props.serverErrors Problems the server found with the payments.
 * @param {(payments: { method: string, amount: string, reference?: string }[]) => void} props.onSubmit
 * @returns {React.JSX.Element}
 */
export function PaymentDialog({
  open,
  onOpenChange,
  net,
  summary,
  notes,
  pending,
  serverErrors,
  onSubmit,
}) {
  const cashRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        title="Take payment"
        description={summary}
        className="max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cashRef.current?.select();
        }}
      >
        {/* Mounted while open only, so every payment starts afresh. */}
        <PaymentForm
          net={net}
          notes={notes}
          pending={pending}
          serverErrors={serverErrors}
          cashRef={cashRef}
          onBack={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param {object} props
 * @param {string} props.net
 * @param {readonly number[]} props.notes
 * @param {boolean} props.pending
 * @param {PaymentErrors} props.serverErrors
 * @param {React.RefObject<HTMLInputElement | null>} props.cashRef The field focused on opening.
 * @param {() => void} props.onBack
 * @param {(payments: { method: string, amount: string, reference?: string }[]) => void} props.onSubmit
 * @returns {React.JSX.Element}
 */
function PaymentForm({ net, notes, pending, serverErrors, cashRef, onBack, onSubmit }) {
  const format = useFormat();
  const id = useId();
  const [entry, setEntry] = useState({
    cash: true,
    mpesa: false,
    cashText: net,
    mpesaText: '',
    code: '',
  });
  const [tried, setTried] = useState(false);

  const preview = previewPayment(net, entry);
  /** Field problems show once the cashier tries to complete, or when the server found them. */
  const errors = { ...(tried ? preview.problems : {}), ...serverErrors };
  const ready = Object.keys(preview.problems).length === 0;

  /**
   * @param {Partial<typeof entry>} change
   * @returns {void}
   */
  const update = (change) => setEntry((current) => ({ ...current, ...change }));

  /**
   * @param {'cash' | 'mpesa'} method
   * @returns {void}
   */
  const toggle = (method) => {
    const next = { ...entry, [method]: !entry[method] };
    if (!next.cash && !next.mpesa) return;
    // Splitting: M-Pesa starts at the whole bill and the cash at nothing; the cashier adjusts one.
    if (next.cash && next.mpesa) Object.assign(next, { mpesaText: '', cashText: '' });
    if (next.cash && !next.mpesa) next.cashText = net;
    setEntry(next);
  };

  /**
   * @param {React.FormEvent} event
   * @returns {void}
   */
  const submit = (event) => {
    event.preventDefault();
    setTried(true);
    if (ready && !pending) onSubmit(preview.payments);
  };

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <div className="flex items-baseline justify-between rounded-lg bg-muted px-4 py-3">
        <span className="text-sm">To pay</span>
        <span className="text-3xl font-bold tabular-nums">{format.money(net)}</span>
      </div>

      <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <legend className="sr-only">How they paid</legend>
        {
          /** @type {const} */ ([
            ['cash', 'Cash'],
            ['mpesa', 'M-Pesa'],
          ]).map(([method, label]) => (
            <button
              key={method}
              type="button"
              aria-pressed={entry[method]}
              className={cn(
                'h-10 rounded-md border text-sm font-medium',
                entry[method] && 'border-primary bg-accent text-primary',
              )}
              onClick={() => toggle(method)}
            >
              {label}
            </button>
          ))
        }
        {LATER.map((label) => (
          <span
            key={label}
            className="grid h-10 place-items-center rounded-md border text-sm text-muted-foreground opacity-60"
          >
            {label} · later
          </span>
        ))}
      </fieldset>

      {entry.mpesa && entry.cash && (
        <AmountField
          id={`${id}-mpesa`}
          label="M-Pesa amount"
          error={errors.mpesa}
          input={{
            value: entry.mpesaText,
            onChange: (event) => update({ mpesaText: event.target.value }),
          }}
        />
      )}
      {entry.mpesa && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-code`}>M-Pesa code (all 10 characters)</Label>
          <Input
            id={`${id}-code`}
            ref={entry.cash ? undefined : cashRef}
            autoComplete="off"
            spellCheck={false}
            maxLength={10}
            className="h-11 font-mono text-lg uppercase md:text-lg"
            placeholder="e.g. QK52AB1XYZ"
            aria-invalid={errors.code ? true : undefined}
            aria-describedby={errors.code ? `${id}-code-error` : undefined}
            value={entry.code}
            onChange={(event) => update({ code: event.target.value })}
          />
          {errors.code && (
            <p id={`${id}-code-error`} className="text-sm text-destructive">
              {errors.code}
            </p>
          )}
          {!entry.cash && errors.mpesa && (
            <p className="text-sm text-destructive">{errors.mpesa}</p>
          )}
        </div>
      )}
      {entry.cash && (
        <>
          <AmountField
            id={`${id}-cash`}
            label={
              entry.mpesa ? `Cash received (due ${format.money(preview.cashDue)})` : 'Cash received'
            }
            error={errors.cash}
            input={{
              ref: cashRef,
              value: entry.cashText,
              onChange: (event) => update({ cashText: event.target.value }),
            }}
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick cash amounts">
            {quickAmounts(preview.cashDue, notes).map((amount, index) => (
              <button
                key={amount}
                type="button"
                className="rounded-full border px-3 py-1 text-sm tabular-nums hover:bg-accent"
                onClick={() => {
                  update({ cashText: amount });
                  cashRef.current?.focus();
                }}
              >
                {index === 0 ? `Exact ${format.money(amount)}` : format.money(amount)}
              </button>
            ))}
          </div>
        </>
      )}

      <div
        className="flex items-baseline justify-between rounded-lg bg-success/10 px-4 py-3 font-semibold text-success"
        aria-live="polite"
      >
        <span>Change to give</span>
        <span className="text-xl tabular-nums">{format.money(preview.change)}</span>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={pending} onClick={onBack}>
          Back{' '}
          <Kbd decorative className="hidden sm:inline-flex">
            {KEY_LABELS.CLEAR}
          </Kbd>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
          Complete sale
          <Kbd
            decorative
            className="hidden border-primary-foreground/40 bg-transparent text-primary-foreground sm:inline-flex"
          >
            {KEY_LABELS.CONFIRM}
          </Kbd>
        </Button>
      </div>
    </form>
  );
}
