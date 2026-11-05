import { ArrowRight, Loader2 } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api-error';

/**
 * @typedef {object} Change
 * @property {string} label e.g. "Phone"
 * @property {string} [from] Value before; omitted for a new record or a plain fact.
 * @property {string} [to] Value after.
 */

/**
 * @typedef {object} ConfirmRequest
 * @property {string} title e.g. "Save these changes?"
 * @property {React.ReactNode} [description]
 * @property {Change[]} [changes] Listed as "Label: from → to".
 * @property {string} confirmLabel e.g. "Save changes"
 * @property {boolean} [destructive]
 * @property {() => Promise<unknown>} onConfirm Runs while the dialog shows it is busy; an error stays in the dialog.
 */

/**
 * A small confirmation on top of everything else, listing what is about to change. "Go back" has
 * the focus, so pressing Enter never confirms by accident.
 *
 * @param {{ request: ConfirmRequest | null, onClose: () => void }} props
 * @returns {React.JSX.Element}
 */
export function SaveConfirmDialog({ request, onClose }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(/** @type {unknown} */ (null));
  const goBack = useRef(/** @type {HTMLButtonElement | null} */ (null));

  const close = () => {
    if (pending) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!request) return;
    setPending(true);
    setError(null);
    try {
      await request.onConfirm();
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };

  return (
    <DialogPrimitive.Root open={request !== null} onOpenChange={(open) => !open && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          role="alertdialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            goBack.current?.focus();
          }}
          className="fixed top-1/2 left-1/2 z-[60] grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-card p-6 shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <div className="grid gap-1.5">
            <DialogPrimitive.Title className="text-lg font-semibold">
              {request?.title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={request?.description ? 'text-sm text-muted-foreground' : 'sr-only'}
            >
              {request?.description ?? request?.title}
            </DialogPrimitive.Description>
          </div>
          {request?.changes?.length ? (
            <ul aria-label="Changes" className="grid gap-2 rounded-lg border p-3 text-sm">
              {request.changes.map((change, index) => (
                <li key={`${change.label}-${index}`} className="grid gap-0.5">
                  <span className="font-medium">{change.label}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                    {change.from !== undefined && (
                      <>
                        <span className="break-all line-through decoration-muted-foreground/50">
                          {change.from}
                        </span>
                        <ArrowRight aria-label="changes to" className="size-3.5 shrink-0" />
                      </>
                    )}
                    <span className="break-all text-foreground">{change.to}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {error !== null && <FormError>{errorMessage(error)}</FormError>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={goBack} type="button" variant="outline" onClick={close} disabled={pending}>
              Go back
            </Button>
            <Button
              type="button"
              variant={request?.destructive ? 'destructive' : 'default'}
              onClick={confirm}
              disabled={pending}
            >
              {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {request?.confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
