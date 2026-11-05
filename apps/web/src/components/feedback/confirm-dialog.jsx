import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api-error';

/**
 * Asks before a consequential action (deactivate, reset a password, ...). The dialog stays open,
 * showing the error, if the action fails; it closes when the action succeeds.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.title
 * @param {React.ReactNode} props.description What will happen, in plain words.
 * @param {string} props.confirmLabel e.g. "Deactivate supplier"
 * @param {() => Promise<unknown>} props.onConfirm
 * @param {boolean} [props.destructive]
 * @returns {React.JSX.Element}
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = false,
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(/** @type {unknown} */ (null));

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setError(null);
          onOpenChange(next);
        }
      }}
    >
      <DialogContent title={title} description={description}>
        {error !== null && <FormError>{errorMessage(error)}</FormError>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={confirm}
            disabled={pending}
          >
            {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
