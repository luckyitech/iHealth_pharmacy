/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { useEffect } from 'react';
import { toast } from 'sonner';

import { applyServerErrors, useZodForm } from '@/components/form/use-zod-form';
import { useSaveResource } from '@/lib/resource-api';

/**
 * @param {string} text
 * @returns {string}
 */
export const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Whether an API error is only about fields (then it shows next to them, not above the form).
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isFieldError(error) {
  let applied = false;
  applyServerErrors(error, () => {
    applied = true;
  });
  return applied;
}

/**
 * Form state and saving for one record, shared by the edit dialog and the edit page.
 *
 * @param {import('./master-resource-page.jsx').MasterResourceConfig} config
 * @param {any | null} item The record, or null for a new one.
 * @param {{ onSaved: () => void }} options
 * @returns The form, the save mutation, whether the record is new, the submit handler and any error that is not about a field.
 */
export function useRecordForm(config, item, { onSaved }) {
  const isNew = item === null;
  const save = useSaveResource(config.resource);
  const form = useZodForm(config.schema, { defaultValues: config.toFormValues(item) });

  const onSubmit = form.handleSubmit((values) =>
    save.mutate(
      { id: isNew ? undefined : item.id, values },
      {
        onSuccess: () => {
          toast.success(isNew ? `${capitalise(config.singular)} created` : 'Changes saved');
          // Saved values are no longer "unsaved changes" (lets the page leave without a warning).
          form.reset(values);
          onSaved();
        },
        onError: (error) => applyServerErrors(error, form.setError),
      },
    ),
  );

  return {
    form,
    save,
    isNew,
    onSubmit,
    formError: save.isError && !isFieldError(save.error) ? save.error : null,
  };
}

/**
 * Saves with Ctrl+S / Cmd+S while `active`, instead of the browser's "save page".
 *
 * @param {boolean} active
 * @param {() => void} onSave
 * @returns {void}
 */
export function useSaveShortcut(active, onSave) {
  useEffect(() => {
    if (!active) return undefined;
    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, onSave]);
}

/**
 * Moves focus to the first field of a form once it is shown.
 *
 * @param {React.RefObject<HTMLElement | null>} container
 * @param {unknown} key Re-runs when it changes (e.g. another record opened).
 * @returns {void}
 */
export function useFocusFirstField(container, key) {
  useEffect(() => {
    const field = container.current?.querySelector(
      'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button[role=combobox]:not([disabled])',
    );
    /** @type {HTMLElement | null | undefined} */ (field)?.focus();
  }, [container, key]);
}
