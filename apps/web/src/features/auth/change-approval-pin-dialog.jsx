import { APPROVAL_PIN_DIGITS, changeApprovalPinFormSchema } from '@ihealth/shared/schemas';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { TextField } from '@/components/form/text-field';
import { applyServerErrors, useZodForm } from '@/components/form/use-zod-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { notify } from '@/lib/notify';

import { changeApprovalPin } from './auth-api.js';

/**
 * Change your own approval PIN, the one you type to approve someone else's return, discount or
 * cancellation. Needs the current PIN; someone without one asks an administrator.
 *
 * @param {{ open: boolean, onClose: () => void }} props
 * @returns {React.JSX.Element}
 */
export function ChangeApprovalPinDialog({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title="Change your approval PIN"
        description="The PIN you type to approve someone else's return, big discount or cancellation. It changes in the old system too."
      >
        {/* Mounted while open only, so the form starts empty each time. */}
        {open && <PinForm onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param {{ onDone: () => void }} props
 * @returns {React.JSX.Element}
 */
function PinForm({ onDone }) {
  const form = useZodForm(changeApprovalPinFormSchema, {
    defaultValues: { currentPin: '', newPin: '', confirmPin: '' },
  });
  const change = useMutation({
    mutationFn: changeApprovalPin,
    onSuccess: () => {
      notify.success('Approval PIN changed');
      onDone();
    },
    onError: (error) => {
      applyServerErrors(error, form.setError);
      notify.failure('Could not change the approval PIN', error);
    },
  });

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={form.handleSubmit(({ currentPin, newPin }) =>
        change.mutate({ currentPin, newPin }),
      )}
    >
      <TextField
        form={form}
        name="currentPin"
        label="Current PIN"
        type="password"
        inputMode="numeric"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          form={form}
          name="newPin"
          label="New PIN"
          type="password"
          inputMode="numeric"
          hint={`${APPROVAL_PIN_DIGITS} digits, not starting with 0.`}
        />
        <TextField
          form={form}
          name="confirmPin"
          label="Confirm new PIN"
          type="password"
          inputMode="numeric"
        />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={change.isPending}>
          {change.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
          Change PIN
        </Button>
      </div>
    </form>
  );
}
