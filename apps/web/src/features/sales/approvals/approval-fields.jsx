import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * @typedef {{ reason: string, approver: string, pin: string }} ApprovalEntry
 * @typedef {Partial<Record<keyof ApprovalEntry, string>>} ApprovalErrors
 */

/**
 * @param {{ id: string, error: string | undefined }} props
 * @returns {React.JSX.Element | null}
 */
function FieldError({ id, error }) {
  return error ? (
    <p id={id} className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

/**
 * Why it is needed: a required text, with quick reasons that fill it.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {readonly string[]} props.quickReasons
 * @param {string | undefined} props.error
 * @returns {React.JSX.Element}
 */
export function ReasonField({ value, onChange, quickReasons, error }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} required>
        Reason
      </Label>
      <Textarea
        id={id}
        rows={2}
        placeholder="Why is this needed?"
        aria-required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={`${id}-error`} error={error} />
      {quickReasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick reasons">
          {quickReasons.map((reason) => (
            <button
              key={reason}
              type="button"
              className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent"
              onClick={() => onChange(reason)}
            >
              {reason}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The second person: their username and approval PIN. The PIN is never kept after sending.
 *
 * @param {object} props
 * @param {Pick<ApprovalEntry, 'approver' | 'pin'>} props.value
 * @param {(change: Partial<ApprovalEntry>) => void} props.onChange
 * @param {ApprovalErrors} props.errors
 * @returns {React.JSX.Element}
 */
export function ApproverFields({ value, onChange, errors }) {
  const id = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid content-start gap-1.5">
        <Label htmlFor={`${id}-user`} required>
          Approver&apos;s username
        </Label>
        <Input
          id={`${id}-user`}
          autoComplete="off"
          spellCheck={false}
          aria-required
          aria-invalid={errors.approver ? true : undefined}
          aria-describedby={errors.approver ? `${id}-user-error` : undefined}
          value={value.approver}
          onChange={(event) => onChange({ approver: event.target.value })}
        />
        <FieldError id={`${id}-user-error`} error={errors.approver} />
      </div>
      <div className="grid content-start gap-1.5">
        <Label htmlFor={`${id}-pin`} required>
          Approver&apos;s PIN
        </Label>
        <Input
          id={`${id}-pin`}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-required
          aria-invalid={errors.pin ? true : undefined}
          aria-describedby={errors.pin ? `${id}-pin-error` : undefined}
          value={value.pin}
          onChange={(event) => onChange({ pin: event.target.value })}
        />
        <FieldError id={`${id}-pin-error`} error={errors.pin} />
      </div>
    </div>
  );
}
