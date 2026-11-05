/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { Loader2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';

import { FormLayoutContext, sectionAnchor } from '@/components/form/form-layout';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { RequiredLegend } from '@/components/ui/label';
import { errorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';

import { RecordActionsMenu, StatusBadge } from './record-actions.jsx';
import { useFocusFirstField, useRecordForm, useSaveShortcut } from './record-form.js';

/** Width and height of the dialog, by record size. Full screen on phones either way. */
const SIZES = Object.freeze({
  small: 'sm:max-h-[min(44rem,90dvh)] sm:max-w-[35rem]',
  large: 'sm:h-[min(56rem,90dvh)] sm:max-w-[68rem]',
});

/**
 * Create or edit a record in a centred dialog over the list. Large records (items, suppliers, ...)
 * get a wide dialog with their sections as cards and a row of section links; small ones a narrow
 * dialog. Header and footer stay put while the fields scroll. Closing with unsaved changes asks first.
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
  const dirty = form.formState.isDirty && canWrite;
  const large = config.dialogSize === 'large';

  useFocusFirstField(body, item?.id ?? 'new');
  useSaveShortcut(canWrite, () => void onSubmit());
  // A reload or closed tab with unsaved changes gets the browser's own warning.
  useEffect(() => {
    if (!dirty) return undefined;
    /**
     * @param {BeforeUnloadEvent} event
     * @returns {void}
     */
    const warn = (event) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Escape, the backdrop and the close button all come through here.
  const requestClose = () => (dirty ? setConfirmingDiscard(true) : onClose());
  const title = isNew ? `New ${config.singular}` : config.recordName(item);
  const code = item && config.recordCode?.(item);
  const sections = large ? (config.sections ?? []) : [];

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
          className={cn(
            'fixed z-50 flex flex-col bg-card shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 max-sm:inset-0 sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border',
            SIZES[large ? 'large' : 'small'],
          )}
        >
          <form
            aria-label={title}
            className="flex min-h-0 flex-1 flex-col"
            noValidate
            onSubmit={onSubmit}
          >
            <header className="border-b">
              <div className="flex items-start gap-3 px-6 pt-4 pb-3">
                <div className="grid min-w-0 flex-1 gap-1">
                  <DialogPrimitive.Title
                    className={cn('truncate font-semibold', large ? 'text-xl' : 'text-lg')}
                  >
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
              </div>
              {sections.length > 1 && (
                <nav aria-label="Sections" className="overflow-x-auto px-4 pb-2">
                  <ul className="flex gap-1 text-sm">
                    {sections.map((section) => (
                      <li key={section}>
                        <button
                          type="button"
                          className="rounded-md px-2.5 py-1 whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          onClick={() =>
                            body.current
                              ?.querySelector(`#${sectionAnchor(section)}`)
                              ?.scrollIntoView({ block: 'start' })
                          }
                        >
                          {section}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </header>

            <div
              ref={body}
              className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', large && 'bg-muted/30')}
            >
              <fieldset disabled={!canWrite || save.isPending} className="grid gap-5">
                {canWrite && <RequiredLegend />}
                {formError ? <FormError>{errorMessage(formError)}</FormError> : null}
                <FormLayoutContext.Provider value={large ? 'card' : 'plain'}>
                  <config.Fields form={form} item={item} />
                </FormLayoutContext.Provider>
              </fieldset>
            </div>

            {canWrite && (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p role="status" className="mr-auto text-sm text-muted-foreground">
                  {dirty ? 'Unsaved changes' : ''}
                </p>
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
