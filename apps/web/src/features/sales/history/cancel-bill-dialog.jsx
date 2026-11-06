import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SHEET_ON_PHONE } from '@/components/ui/dialog-variants';
import { isApiError } from '@/lib/api-error';
import { useFormat } from '@/lib/format';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

import { approvalErrorsOf, missingApproval } from '../approvals/approval-entry.js';
import { ApproverFields, ReasonField } from '../approvals/approval-fields.jsx';
import { useCancelBill } from '../till/till-api.js';

/**
 * @typedef {object} CancelRules
 * @property {boolean} alone The cashier may cancel this bill without a second person.
 * @property {number} ageMinutes How long ago the bill was made.
 * @property {number} aloneMinutes How long a cashier may cancel their own bill alone.
 * @property {readonly string[]} quickReasons
 */

/**
 * Cancelling a bill of today: the reason, and a second person's username and PIN when the cashier
 * may not do it alone. Says plainly what will happen.
 *
 * @param {object} props
 * @param {import('./sales-api.js').BillDetail} props.bill
 * @param {CancelRules} props.rules
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @returns {React.JSX.Element}
 */
export function CancelBillDialog({ bill, rules, open, onOpenChange }) {
  const cancel = useCancelBill();
  return (
    <Dialog open={open} onOpenChange={(next) => !cancel.isPending && onOpenChange(next)}>
      <DialogContent
        title={`Cancel bill ${bill.code ?? `#${bill.id}`}?`}
        description={
          rules.alone
            ? `Your bill, made ${rules.ageMinutes} minutes ago. You can cancel it yourself for ${rules.aloneMinutes} minutes.`
            : `Made ${rules.ageMinutes} minutes ago${bill.cashierName ? ` by ${bill.cashierName}` : ''}. A second person must approve.`
        }
        className={cn('max-w-lg', SHEET_ON_PHONE)}
      >
        <CancelForm bill={bill} rules={rules} cancel={cancel} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param {object} props
 * @param {import('./sales-api.js').BillDetail} props.bill
 * @param {CancelRules} props.rules
 * @param {ReturnType<typeof useCancelBill>} props.cancel
 * @param {() => void} props.onDone
 * @returns {React.JSX.Element}
 */
function CancelForm({ bill, rules, cancel, onDone }) {
  const format = useFormat();
  const [entry, setEntry] = useState({ reason: '', approver: '', pin: '' });
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const missing = missingApproval(entry, { needApprover: !rules.alone });
  const errors = { ...(tried ? missing : {}), ...serverErrors };

  /**
   * @param {React.FormEvent} event
   * @returns {void}
   */
  const submit = (event) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(missing).length || cancel.isPending) return;
    cancel.mutate(
      {
        id: bill.id,
        reason: entry.reason.trim(),
        ...(rules.alone ? {} : { approver: entry.approver.trim(), pin: entry.pin }),
      },
      {
        onSuccess: () => {
          notify.success(`Bill ${bill.code ?? bill.id} cancelled`, {
            description: 'Its items are back in stock and its cash is out of the till.',
          });
          onDone();
        },
        onError: (error) => {
          setServerErrors(approvalErrorsOf(error));
          const details = isApiError(error) ? (error.details ?? []) : [];
          notify.failure('Could not cancel the bill', error, {
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
      <Alert>
        <AlertDescription>
          The {bill.lines.length} {bill.lines.length === 1 ? 'item goes' : 'items go'} back into
          stock and the {format.money(bill.totals.net)} comes out of the till. The bill stays in
          Sales history, marked Cancelled.
        </AlertDescription>
      </Alert>
      <ReasonField
        value={entry.reason}
        onChange={(reason) => setEntry((current) => ({ ...current, reason }))}
        quickReasons={rules.quickReasons}
        error={errors.reason}
      />
      {!rules.alone && (
        <ApproverFields
          value={entry}
          onChange={(change) => setEntry((current) => ({ ...current, ...change }))}
          errors={errors}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Bills from an earlier day can&apos;t be cancelled; make a return instead.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={cancel.isPending} onClick={onDone}>
          Keep the bill
        </Button>
        <Button type="submit" variant="destructive" disabled={cancel.isPending}>
          {cancel.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
          {rules.alone ? 'Cancel bill' : 'Approve and cancel'}
        </Button>
      </div>
    </form>
  );
}
