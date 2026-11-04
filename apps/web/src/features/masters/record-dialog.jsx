/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { Loader2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRef, useState } from 'react';

import { FormLayoutContext } from '@/components/form/form-layout';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { RequiredLegend } from '@/components/ui/label';
import { errorMessage } from '@/lib/api-error';

import { RecordActionsMenu, StatusBadge } from './record-actions.jsx';
import { useFocusFirstField, useRecordForm, useSaveShortcut } from './record-form.js';

/**
 * Create or edit a small record (a handful of fields) in a centred dialog; full screen on phones.
 * Closing with unsaved changes asks first.
 *
 * @param {{ config: import('./master-resource-page.jsx').MasterResourceConfig, item: any | null, canWrite: boolean, onClose: () => void }} props
 *   `item` is the record, or null for a new one.
 * @returns {React.JSX.Element}
 */
export function RecordDialog({ config, item, canWrite, onClose }) {
  const { form, save, isNew, onSubmit, formError } = useRecordForm(config, item, {
    onSaved: onClose,
  });
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const body = useRef(/** @type {HTMLDivElement | null} */ (null));
  const dirty = form.formState.isDirty;

  useFocusFirstField(body, item?.id ?? 'new');
  useSaveShortcut(canWrite, () => void onSubmit());

  const requestClose = () => (dirty && canWrite ? setConfirmingDiscard(true) : onClose());
  const title = isNew ? `New ${config.singular}` : config.recordName(item);
  const code = item && config.recordCode?.(item);

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && requestClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="dialog-overlay"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          // Focus goes to the first field instead (useFocusFirstField).
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed z-50 flex flex-col bg-card shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 max-sm:inset-0 sm:top-1/2 sm:left-1/2 sm:max-h-[min(44rem,90dvh)] sm:w-[calc(100%-2rem)] sm:max-w-[35rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border"
        >
          <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={onSubmit}>
            <header className="flex items-start gap-3 border-b px-6 py-4">
              <div className="grid min-w-0 flex-1 gap-1">
                <DialogPrimitive.Title className="truncate text-lg font-semibold">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description asChild>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {isNew ? (
                      config.description
                    ) : (
                      <>
                        {code && <span className="font-mono text-xs">{code}</span>}
                        <StatusBadge active={item.active !== false} />
                      </>
                    )}
                  </div>
                </DialogPrimitive.Description>
              </div>
              {!isNew && canWrite && (
                <RecordActionsMenu config={config} item={item} onDone={onClose} />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={requestClose}
              >
                <X aria-hidden="true" />
              </Button>
            </header>

            <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <fieldset disabled={!canWrite || save.isPending} className="grid gap-5">
                {canWrite && <RequiredLegend />}
                {formError ? <FormError>{errorMessage(formError)}</FormError> : null}
                <FormLayoutContext.Provider value="dialog">
                  <config.Fields form={form} item={item} />
                </FormLayoutContext.Provider>
              </fieldset>
            </div>

            {canWrite && (
              <footer className="flex items-center justify-end gap-2 border-t px-6 py-4">
                <Button type="button" variant="outline" onClick={requestClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
                  {isNew ? `Create ${config.singular}` : 'Save changes'}
                </Button>
              </footer>
            )}
          </form>
          <ConfirmDialog
            open={confirmingDiscard}
            onOpenChange={setConfirmingDiscard}
            destructive
            title="Discard your changes?"
            description="What you changed in this form has not been saved."
            confirmLabel="Discard changes"
            onConfirm={async () => onClose()}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
