import { APPROVAL_REASONS } from '@ihealth/shared/schemas';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SHEET_ON_PHONE } from '@/components/ui/dialog-variants';
import { Kbd } from '@/components/ui/kbd';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';

import { missingApproval } from '../approvals/approval-entry.js';
import { ApproverFields, ReasonField } from '../approvals/approval-fields.jsx';
import { KEY_LABELS } from './till-keys.js';

/**
 * @typedef {import('./till-api.js').SaleQuote['lines'][number]} QuoteLine
 * @typedef {import('../approvals/approval-fields.jsx').ApprovalEntry} ApprovalEntry
 * @typedef {import('../approvals/approval-fields.jsx').ApprovalErrors} ApprovalErrors
 */

/**
 * One approval for the whole sale: what needs it, why, and the second person's username and PIN.
 * Never the cashier; the server checks that too.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {QuoteLine[]} props.lines The lines that need approval.
 * @param {number} props.discountLimit
 * @param {readonly string[]} props.quickReasons
 * @param {boolean} props.pending
 * @param {ApprovalErrors} props.serverErrors
 * @param {(entry: ApprovalEntry) => void} props.onSubmit
 * @returns {React.JSX.Element}
 */
export function ApprovalDialog({
  open,
  onOpenChange,
  lines,
  discountLimit,
  quickReasons,
  pending,
  serverErrors,
  onSubmit,
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        title="Approval needed"
        description="A second person with “Sales approval” checks and enters their PIN. Not the cashier."
        className={cn('max-w-xl', SHEET_ON_PHONE)}
      >
        {/* Mounted while open only, so the PIN is never kept. */}
        <ApprovalForm
          lines={lines}
          discountLimit={discountLimit}
          quickReasons={quickReasons}
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
 * @param {QuoteLine[]} props.lines
 * @param {number} props.discountLimit
 * @param {readonly string[]} props.quickReasons
 * @param {boolean} props.pending
 * @param {ApprovalErrors} props.serverErrors
 * @param {() => void} props.onBack
 * @param {(entry: ApprovalEntry) => void} props.onSubmit
 * @returns {React.JSX.Element}
 */
function ApprovalForm({
  lines,
  discountLimit,
  quickReasons,
  pending,
  serverErrors,
  onBack,
  onSubmit,
}) {
  const format = useFormat();
  const [entry, setEntry] = useState({ reason: '', approver: '', pin: '' });
  const [tried, setTried] = useState(false);
  const missing = missingApproval(entry, { needApprover: true });
  const errors = { ...(tried ? missing : {}), ...serverErrors };

  /**
   * @param {QuoteLine} line
   * @returns {string[]} One sentence per reason the line needs approval.
   */
  const whyOf = (line) =>
    line.needsApproval.map((reason) => {
      if (reason === APPROVAL_REASONS.DISCOUNT)
        return `Discount ${line.discountPercent}% (the limit is ${discountLimit}%)`;
      if (reason === APPROVAL_REASONS.PRICE)
        return `Price ${format.money(line.batchLabelPrice)} → ${format.money(line.labelPrice)}`;
      return 'Sold for less than it cost the pharmacy';
    });

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (!Object.keys(missing).length && !pending) onSubmit(entry);
      }}
    >
      <ul className="divide-y rounded-lg border" aria-label="What needs approval">
        {lines.map((line) => (
          <li key={line.stockId} className="grid gap-0.5 px-3 py-2 text-sm">
            <span className="font-medium">{line.itemName ?? line.itemCode ?? '—'}</span>
            <span className="text-muted-foreground">
              {line.quantity} × {format.money(line.labelPrice)} · {whyOf(line).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
      <ReasonField
        value={entry.reason}
        onChange={(reason) => setEntry((current) => ({ ...current, reason }))}
        quickReasons={quickReasons}
        error={errors.reason}
      />
      <ApproverFields
        value={entry}
        onChange={(change) => setEntry((current) => ({ ...current, ...change }))}
        errors={errors}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={pending} onClick={onBack}>
          Back{' '}
          <Kbd decorative className="hidden sm:inline-flex">
            {KEY_LABELS.CLEAR}
          </Kbd>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
          Approve and pay
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
