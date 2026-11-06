import { PAYMENT_METHODS } from '@ihealth/shared/schemas';
import { Loader2, X } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';

import { useAppInfo } from '@/app/use-app-info';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SHEET_ON_PHONE } from '@/components/ui/dialog-variants';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

import { METHOD_LABELS } from '../history/bill-labels.js';
import { CreditNoteCheck } from './credit-note-check.jsx';
import {
  newRow,
  parseAmount,
  previewPayment,
  problemKey,
  quickAmounts,
  TILL_METHODS,
} from './payment.js';
import { SALES_LABELS } from '../labels.js';

/** Alt and a number add (or go to) each way of paying, in the order of TILL_METHODS. */
const METHOD_KEYS = Object.freeze(TILL_METHODS.map((_, index) => `Digit${index + 1}`));

const ISO_DATE_LOCALE = 'en-CA'; // hardcode-ok: a locale that formats dates as YYYY-MM-DD, used only to build text

/**
 * @typedef {import('./payment.js').PaymentRow} PaymentRow
 * @typedef {Record<string, string>} PaymentErrors Keyed like `card.reference` (see problemKey).
 */

/**
 * @typedef {object} PaymentRules
 * @property {readonly number[]} notes Bank notes for the quick cash amounts.
 * @property {{ id: number, name: string }[]} banks
 * @property {boolean} canAcceptCheques
 * @property {number} chequeMaxAgeMonths
 */

/**
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.label
 * @param {string | undefined} props.error
 * @param {boolean} [props.required]
 * @param {(control: { id: string, 'aria-invalid'?: boolean, 'aria-describedby'?: string, 'aria-required'?: boolean }) => React.ReactNode} props.children
 * @returns {React.JSX.Element}
 */
function Field({ id, label, error, required = true, children }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-error` : undefined,
        'aria-required': required || undefined,
      })}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Taking the money: cash, M-Pesa, card and cheque, alone or together. Opens with the exact cash
 * amount filled in, so Enter completes a cash sale at once. Each way added starts with what is
 * left to pay; only cash can be more than the bill, and the change shows while typing.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.net
 * @param {string} props.summary e.g. "Walk-in · 3 lines"
 * @param {PaymentRules} props.rules
 * @param {boolean} props.pending
 * @param {PaymentErrors} props.serverErrors Problems the server found with the payments.
 * @param {(payments: Record<string, unknown>[]) => void} props.onSubmit
 * @returns {React.JSX.Element}
 */
export function PaymentDialog({
  open,
  onOpenChange,
  net,
  summary,
  rules,
  pending,
  serverErrors,
  onSubmit,
}) {
  const formRef = useRef(/** @type {HTMLFormElement | null} */ (null));
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        title="Take payment"
        description={summary}
        className={cn('max-w-2xl', SHEET_ON_PHONE)}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          /** @type {HTMLInputElement | null | undefined} */ (
            formRef.current?.querySelector('input')
          )?.select();
        }}
      >
        {/* Mounted while open only, so every payment starts afresh. */}
        <PaymentForm
          formRef={formRef}
          net={net}
          rules={rules}
          pending={pending}
          serverErrors={serverErrors}
          onBack={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param {object} props
 * @param {React.RefObject<HTMLFormElement | null>} props.formRef
 * @param {string} props.net
 * @param {PaymentRules} props.rules
 * @param {boolean} props.pending
 * @param {PaymentErrors} props.serverErrors
 * @param {() => void} props.onBack
 * @param {(payments: Record<string, unknown>[]) => void} props.onSubmit
 * @returns {React.JSX.Element}
 */
function PaymentForm({ formRef, net, rules, pending, serverErrors, onBack, onSubmit }) {
  const format = useFormat();
  const id = useId();
  const timeZone = useAppInfo().data?.region.timeZone;
  const today = new Intl.DateTimeFormat(ISO_DATE_LOCALE, { timeZone }).format(new Date());
  const [rows, setRows] = useState(
    /** @type {PaymentRow[]} */ ([newRow(PAYMENT_METHODS.CASH, net)]),
  );
  const [tried, setTried] = useState(false);

  const preview = previewPayment(net, rows, {
    today,
    chequeMaxAgeMonths: rules.chequeMaxAgeMonths,
  });
  /** Field problems show once the cashier tries to complete, or when the server found them. */
  const errors = { ...(tried ? preview.problems : {}), ...serverErrors };
  const methods = new Set(rows.map((row) => row.method));

  /**
   * @param {string} method
   * @returns {void}
   */
  const focusRow = (method) => {
    requestAnimationFrame(() =>
      /** @type {HTMLInputElement | null | undefined} */ (
        formRef.current?.querySelector(`[data-method="${method}"] input`)
      )?.focus(),
    );
  };

  /**
   * Adds a way of paying, starting with what is left to pay (for cash: what cash still has to
   * cover), or goes to it when it is there already.
   *
   * @param {string} method
   * @returns {void}
   */
  const add = (method) => {
    if (method === PAYMENT_METHODS.CHEQUE && !rules.canAcceptCheques) return;
    // The cash row the window opened with, still for the whole bill, gives way to the first other way.
    const untouchedCash =
      rows.length === 1 && rows[0].method === PAYMENT_METHODS.CASH && rows[0].amount === net;
    if (untouchedCash && method !== PAYMENT_METHODS.CASH) setRows([newRow(method, net)]);
    else if (!methods.has(method))
      setRows((current) => [
        ...current,
        newRow(method, method === PAYMENT_METHODS.CASH ? preview.cashDue : preview.remaining),
      ]);
    focusRow(method);
  };

  // Alt 1 to 4 add (or go to) cash, M-Pesa, card and cheque while the window is open.
  const onKey = useEffectEvent((/** @type {KeyboardEvent} */ event) => {
    const index = METHOD_KEYS.indexOf(event.code);
    if (event.altKey && index >= 0) {
      event.preventDefault();
      add(TILL_METHODS[index]);
    }
  });
  useEffect(() => {
    const listener = (/** @type {KeyboardEvent} */ event) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  /**
   * @param {string} method
   * @param {Partial<PaymentRow>} change
   * @returns {void}
   */
  const update = (method, change) =>
    setRows((current) =>
      current.map((row) => (row.method === method ? { ...row, ...change } : row)),
    );

  /**
   * @param {string} method
   * @returns {void}
   */
  const remove = (method) => setRows((current) => current.filter((row) => row.method !== method));

  /**
   * @param {React.FormEvent} event
   * @returns {void}
   */
  const submit = (event) => {
    event.preventDefault();
    setTried(true);
    if (preview.ready && !pending) onSubmit(preview.payments);
  };

  /**
   * @param {PaymentRow} row
   * @param {keyof PaymentRow} field
   * @returns {string}
   */
  const fieldId = (row, field) => `${id}-${row.method}-${field}`;
  /**
   * @param {PaymentRow} row
   * @param {string} field
   * @returns {string | undefined}
   */
  const errorOf = (row, field) => errors[problemKey(row.method, field)];

  /**
   * @param {PaymentRow} row
   * @param {string} label
   * @returns {React.JSX.Element}
   */
  const amountField = (row, label) => (
    <Field id={fieldId(row, 'amount')} label={label} error={errorOf(row, 'amount')}>
      {(control) => (
        <Input
          {...control}
          inputMode="decimal"
          className="h-11 text-base tabular-nums"
          value={row.amount}
          onChange={(event) => update(row.method, { amount: event.target.value })}
        />
      )}
    </Field>
  );

  /**
   * @param {PaymentRow} row
   * @param {string} label
   * @param {{ placeholder?: string, maxLength?: number }} [options]
   * @returns {React.JSX.Element}
   */
  const referenceField = (row, label, { placeholder, maxLength } = {}) => (
    <Field id={fieldId(row, 'reference')} label={label} error={errorOf(row, 'reference')}>
      {(control) => (
        <Input
          {...control}
          spellCheck={false}
          maxLength={maxLength}
          placeholder={placeholder}
          className="h-11 font-mono text-base uppercase"
          value={row.reference}
          onChange={(event) => update(row.method, { reference: event.target.value })}
        />
      )}
    </Field>
  );

  /**
   * @param {PaymentRow} row
   * @returns {React.ReactNode}
   */
  const fieldsOf = (row) => {
    if (row.method === PAYMENT_METHODS.CASH) {
      const label =
        methods.size > 1 ? `Cash received (due ${format.money(preview.cashDue)})` : 'Cash received';
      return (
        <div className="grid gap-2">
          {amountField(row, label)}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick cash amounts">
            {quickAmounts(preview.cashDue, rules.notes).map((amount, index) => (
              <button
                key={amount}
                type="button"
                className="rounded-full border px-3 py-1 text-sm tabular-nums hover:bg-accent"
                onClick={() => {
                  update(row.method, { amount });
                  focusRow(row.method);
                }}
              >
                {index === 0 ? `Exact ${format.money(amount)}` : format.money(amount)}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (row.method === PAYMENT_METHODS.MPESA) {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {amountField(row, 'Amount')}
          {referenceField(row, 'M-Pesa code (all 10 characters)', {
            placeholder: 'e.g. QK52AB1XYZ',
            maxLength: 10,
          })}
        </div>
      );
    }
    if (row.method === PAYMENT_METHODS.CREDIT_NOTE) {
      return (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {referenceField(row, 'Credit note number', { placeholder: 'e.g. DPCN0611260001' })}
            {amountField(row, 'Amount to use')}
          </div>
          <CreditNoteCheck
            code={row.reference}
            onUse={(balance) => {
              // As much of the bill as the other non-cash payments leave, up to what is on the note.
              const others = rows
                .filter(
                  (other) =>
                    other.method !== PAYMENT_METHODS.CASH &&
                    other.method !== PAYMENT_METHODS.CREDIT_NOTE,
                )
                .reduce((sum, other) => sum + Number(parseAmount(other.amount) ?? 0), 0);
              const use = Math.max(Math.min(Number(balance), Number(net) - others), 0);
              update(row.method, { amount: use.toFixed(2) });
            }}
          />
        </div>
      );
    }
    if (row.method === PAYMENT_METHODS.CARD) {
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {amountField(row, 'Amount')}
          {referenceField(row, 'Approval code', { placeholder: 'From the card machine slip' })}
        </div>
      );
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {amountField(row, 'Amount')}
        {referenceField(row, 'Cheque number')}
        <Field id={fieldId(row, 'bankId')} label="Bank" error={errorOf(row, 'bankId')}>
          {(control) => (
            <NativeSelect
              {...control}
              className="h-11"
              value={row.bankId}
              onChange={(event) => update(row.method, { bankId: event.target.value })}
            >
              <option value="">Choose…</option>
              {rules.banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field
          id={fieldId(row, 'chequeDate')}
          label="Cheque date"
          error={errorOf(row, 'chequeDate')}
        >
          {(control) => (
            <Input
              {...control}
              type="date"
              className="h-11"
              value={row.chequeDate}
              onChange={(event) => update(row.method, { chequeDate: event.target.value })}
            />
          )}
        </Field>
      </div>
    );
  };

  const covered = preview.remaining === '0.00';
  const generalError = serverErrors[problemKey('payments', 'total')];

  return (
    <form ref={formRef} className="grid gap-4" onSubmit={submit} noValidate>
      <div className="flex items-baseline justify-between rounded-lg bg-muted px-4 py-3">
        <span className="text-sm">{SALES_LABELS.NET_AMOUNT}</span>
        <span className="text-3xl font-bold tabular-nums">{format.money(net)}</span>
      </div>

      <div
        className="grid grid-cols-3 gap-2 sm:grid-cols-5"
        role="group"
        aria-label="Add a way of paying"
      >
        {TILL_METHODS.map((method) => {
          const chequeBlocked = method === PAYMENT_METHODS.CHEQUE && !rules.canAcceptCheques;
          return (
            <button
              key={method}
              type="button"
              aria-pressed={methods.has(method)}
              disabled={chequeBlocked}
              title={chequeBlocked ? 'You may not take cheques' : undefined}
              className={cn(
                'grid h-12 place-items-center rounded-md border border-dashed text-sm font-medium leading-tight disabled:opacity-50',
                methods.has(method) && 'border-solid border-primary bg-accent text-primary',
              )}
              onClick={() => add(method)}
            >
              <span>{METHOD_LABELS[/** @type {keyof typeof METHOD_LABELS} */ (method)]}</span>
              {chequeBlocked && (
                <span className="text-[11px] font-normal text-muted-foreground">Not allowed</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3">
        {rows.map((row) => (
          <fieldset
            key={row.method}
            data-method={row.method}
            className="grid gap-3 rounded-lg border p-3"
          >
            <legend className="sr-only">
              {METHOD_LABELS[/** @type {keyof typeof METHOD_LABELS} */ (row.method)]}
            </legend>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold">
                {METHOD_LABELS[/** @type {keyof typeof METHOD_LABELS} */ (row.method)]}
                {row.method === PAYMENT_METHODS.CASH && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    gives change
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => remove(row.method)}
              >
                Remove <X aria-hidden="true" />
                <span className="sr-only">
                  {METHOD_LABELS[/** @type {keyof typeof METHOD_LABELS} */ (row.method)]}
                </span>
              </Button>
            </div>
            {fieldsOf(row)}
          </fieldset>
        ))}
      </div>

      <div
        className={cn(
          'flex items-baseline justify-between rounded-lg px-4 py-3 font-semibold',
          covered ? 'bg-success/10 text-success' : 'bg-warning/15 text-foreground',
        )}
        aria-live="polite"
      >
        <span>{covered ? 'Change to give' : 'Still to pay'}</span>
        <span className="text-xl tabular-nums">
          {format.money(covered ? preview.change : preview.remaining)}
        </span>
      </div>
      {generalError && <p className="text-sm text-destructive">{generalError}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {!covered && (
          <p className="text-xs text-muted-foreground sm:mr-auto">
            Add another way of paying for the rest. Only cash can be more than the bill.
          </p>
        )}
        <Button type="button" variant="outline" disabled={pending} onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={pending || (tried && !preview.ready)}>
          {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
          Complete sale
        </Button>
      </div>
    </form>
  );
}
