/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { Link, useBlocker, useLocation, useNavigate, useParams } from 'react-router';

import { FormLayoutContext, sectionAnchor } from '@/components/form/form-layout';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { RequiredLegend } from '@/components/ui/label';
import { usePermissions } from '@/features/auth/use-permissions';
import { errorMessage } from '@/lib/api-error';
import { useResource } from '@/lib/resource-api';

import { RECORD_ID_PARAM } from './record-params.js';
import { RecordActionsMenu, StatusBadge } from './record-actions.jsx';
import { useFocusFirstField, useRecordForm, useSaveShortcut } from './record-form.js';

/**
 * @typedef {{ listSearch?: string }} EditorLocationState The list's query string, to return to the same page, search and filters.
 */

/**
 * A large record (an item, supplier, customer or employee) on its own page: breadcrumb back to
 * the list, a header with name, code and status, sections as cards with a section menu on wide
 * screens, and a sticky action bar. Leaving with unsaved changes asks first.
 *
 * @param {{ config: import('./master-resource-page.jsx').MasterResourceConfig }} props
 * @returns {React.JSX.Element}
 */
export function RecordEditorPage({ config }) {
  const params = useParams();
  const raw = params[RECORD_ID_PARAM];
  const id = raw === undefined ? undefined : Number(raw);
  const record = useResource(config.resource, id);

  if (id !== undefined && (Number.isNaN(id) || record.isError)) {
    return (
      <PageState
        state="error"
        title={`This ${config.singular} could not be opened`}
        description={record.error ? errorMessage(record.error) : undefined}
      />
    );
  }
  if (id !== undefined && record.isPending) return <PageState state="loading" title="Loading…" />;
  return (
    <EditorForm key={id ?? 'new'} config={config} item={id === undefined ? null : record.data} />
  );
}

/**
 * @param {{ config: import('./master-resource-page.jsx').MasterResourceConfig, item: any | null }} props
 * @returns {React.JSX.Element}
 */
function EditorForm({ config, item }) {
  const navigate = useNavigate();
  const location = useLocation();
  const listPath = `/${config.resource}${/** @type {EditorLocationState | null} */ (location.state)?.listSearch ?? ''}`;
  const { hasAny } = usePermissions();
  const canWrite = hasAny(config.writePermissions);

  const backToList = useCallback(() => navigate(listPath), [navigate, listPath]);
  // Set once saved: the form's "dirty" flag only clears on the next render, after the navigation.
  const saved = useRef(false);
  const { form, save, isNew, onSubmit, formError } = useRecordForm(config, item, {
    onSaved: () => {
      saved.current = true;
      backToList();
    },
  });
  const dirty = form.formState.isDirty;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !saved.current && canWrite && dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  // A reload or closed tab with unsaved changes gets the browser's own warning.
  useEffect(() => {
    if (!dirty || !canWrite) return undefined;
    /**
     * @param {BeforeUnloadEvent} event
     * @returns {void}
     */
    const warn = (event) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, canWrite]);

  const formRef = useRef(/** @type {HTMLFormElement | null} */ (null));
  useFocusFirstField(formRef, item?.id ?? 'new');
  useSaveShortcut(canWrite, () => void onSubmit());
  useEffect(() => {
    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
      // Escape goes back to the list, unless a menu, dialog or picker is open and handles it.
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('[role=dialog],[role=menu],[role=listbox]')
      )
        backToList();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [backToList]);

  const sections = config.sections ?? [];
  const title = isNew ? `New ${config.singular}` : config.recordName(item);
  const code = item && config.recordCode?.(item);

  return (
    <div className="grid gap-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to={listPath} className="hover:text-foreground hover:underline">
              {config.title}
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </li>
          <li aria-current="page" className="truncate text-foreground">
            {title}
          </li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
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
        </div>
        {!isNew && canWrite && (
          <RecordActionsMenu config={config} item={item} onDone={backToList} />
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[11rem_minmax(0,1fr)]">
        {sections.length > 1 && (
          <nav aria-label="Sections" className="hidden xl:block">
            <ul className="sticky top-20 grid gap-0.5 text-sm">
              {sections.map((section) => (
                <li key={section}>
                  <a
                    href={`#${sectionAnchor(section)}`}
                    className="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={(event) => {
                      // Scroll without changing the URL, which holds the record.
                      event.preventDefault();
                      document
                        .getElementById(sectionAnchor(section))
                        ?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    {section}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <form
          ref={formRef}
          aria-label={title}
          noValidate
          onSubmit={onSubmit}
          className="grid min-w-0 gap-5"
        >
          <fieldset disabled={!canWrite || save.isPending} className="grid gap-5">
            {canWrite && <RequiredLegend />}
            {formError ? <FormError>{errorMessage(formError)}</FormError> : null}
            <FormLayoutContext.Provider value="page">
              <div className="grid gap-5 2xl:grid-cols-2 2xl:items-start">
                <config.Fields form={form} item={item} />
              </div>
            </FormLayoutContext.Provider>
          </fieldset>

          {canWrite && (
            <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-b-xl sm:border sm:px-5">
              <p role="status" className="mr-auto text-sm text-muted-foreground">
                {dirty ? 'Unsaved changes' : ''}
              </p>
              <Button type="button" variant="outline" onClick={backToList}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
                {isNew ? `Create ${config.singular}` : 'Save changes'}
              </Button>
            </div>
          )}
        </form>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.state === 'blocked' && blocker.reset()}
        destructive
        title="Leave without saving?"
        description="What you changed on this page has not been saved."
        confirmLabel="Leave without saving"
        onConfirm={async () => blocker.state === 'blocked' && blocker.proceed()}
      />
    </div>
  );
}
