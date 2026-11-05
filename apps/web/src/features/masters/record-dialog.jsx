/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { Loader2, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';

import { FormLayoutContext, sectionAnchor } from '@/components/form/form-layout';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { RequiredLegend } from '@/components/ui/label';
import { usePermissions } from '@/features/auth/use-permissions';
import { useConfirm } from '@/hooks/use-confirm';
import { errorMessage } from '@/lib/api-error';
import { describeChanges } from '@/lib/form-changes';
import { cn } from '@/lib/utils';

import { RecordActionsMenu, StatusBadge } from './record-actions.jsx';
import { useFocusFirstField, useRecordForm, useSaveShortcut } from './record-form.js';

/** The record's own fields; other tabs come from the master's config. */
const DETAILS_TAB = 'details';

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
  const { form, save, isNew, saveValues, formError } = useRecordForm(config, item, {
    onSaved: onClose,
  });
  const confirmation = useConfirm();
  const title = isNew ? `New ${config.singular}` : config.recordName(item);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  // Extra tabs (e.g. an employee's sign-in and access) exist only for saved records.
  const { hasAny } = usePermissions();
  const tabs = item ? (config.tabs ?? []).filter((candidate) => hasAny(candidate.permissions)) : [];
  const [tab, setTab] = useState(DETAILS_TAB);
  const onDetails = tab === DETAILS_TAB;
  const body = useRef(/** @type {HTMLDivElement | null} */ (null));
  const dirty = form.formState.isDirty && canWrite;
  const large = config.dialogSize === 'large';

  useFocusFirstField(body, item?.id ?? 'new');
  // Saving always asks first: edits can be made by mistake. Ctrl+S opens the same question.
  /**
   * @param {Record<string, unknown>} values Validated values.
   * @returns {void}
   */
  const askToSave = (values) => {
    if (isNew) {
      const code = config.recordCode?.(values);
      confirmation.ask({
        title: `Create this ${config.singular}?`,
        changes: [
          { label: 'Name', to: config.recordName(values) },
          ...(code ? [{ label: 'Code', to: String(code) }] : []),
        ],
        confirmLabel: `Create ${config.singular}`,
        onConfirm: () => saveValues(values),
      });
      return;
    }
    confirmation.ask({
      title: 'Save these changes?',
      description: title,
      changes: describeChanges(
        body.current,
        /** @type {Record<string, unknown>} */ (form.formState.defaultValues ?? {}),
        form.getValues(),
      ),
      confirmLabel: 'Save changes',
      onConfirm: () => saveValues(values),
    });
  };
  /**
   * @param {React.BaseSyntheticEvent} [event]
   * @returns {Promise<void>}
   */
  const onSubmit = (event) => form.handleSubmit(askToSave)(event);
  useSaveShortcut(canWrite && onDetails && (isNew || dirty), () => void onSubmit());
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
  const code = item && config.recordCode?.(item);
  const sections = large && onDetails ? (config.sections ?? []) : [];
  const activeTab = tabs.find((candidate) => candidate.id === tab);

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
            {tabs.length > 0 && (
              <div role="tablist" aria-label="Parts of the record" className="flex gap-1 px-4">
                {[{ id: DETAILS_TAB, label: 'Details' }, ...tabs].map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="tab"
                    id={`tab-${candidate.id}`}
                    aria-selected={tab === candidate.id}
                    aria-controls={`panel-${candidate.id}`}
                    onClick={() => setTab(candidate.id)}
                    className={cn(
                      '-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      tab === candidate.id
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            )}
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

          <form
            aria-label={title}
            id={`panel-${DETAILS_TAB}`}
            role={tabs.length ? 'tabpanel' : undefined}
            aria-labelledby={tabs.length ? `tab-${DETAILS_TAB}` : undefined}
            hidden={!onDetails}
            className="flex min-h-0 flex-1 flex-col"
            noValidate
            onSubmit={onSubmit}
          >
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
                <Button type="submit" disabled={save.isPending || (!isNew && !dirty)}>
                  {save.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
                  {isNew ? `Create ${config.singular}` : 'Save changes'}
                </Button>
              </footer>
            )}
          </form>
          {activeTab && (
            <div
              role="tabpanel"
              id={`panel-${activeTab.id}`}
              aria-labelledby={`tab-${activeTab.id}`}
              className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-6 py-5"
            >
              <activeTab.Component item={item} canWrite={canWrite} />
            </div>
          )}
          {confirmation.dialog}
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
