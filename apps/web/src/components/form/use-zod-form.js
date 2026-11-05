/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';

import { isApiError } from '@/lib/api-error';

/**
 * React Hook Form wired to a shared Zod schema, so the form validates with exactly the API's rules.
 *
 * @template {import('zod').ZodType} S
 * @param {S} schema
 * @param {import('react-hook-form').UseFormProps<import('zod').input<S>>} [options]
 * @returns {import('react-hook-form').UseFormReturn<import('zod').input<S>, unknown, import('zod').output<S>>}
 */
export function useZodForm(schema, options = {}) {
  const form = useForm({
    resolver: zodResolver(/** @type {any} */ (schema)),
    mode: 'onTouched',
    ...options,
  });
  const required = useMemo(() => requiredFieldsOf(schema), [schema]);
  REQUIRED_FIELDS.set(form.control, required);
  return form;
}

/** The required fields of each form, keyed by its (stable) control. */
const REQUIRED_FIELDS = new WeakMap();

/**
 * Fields the schema refuses when left empty: they are marked as required on screen, so the
 * marks always match the validation.
 *
 * @param {import('zod').ZodType} schema
 * @returns {ReadonlySet<string>}
 */
export function requiredFieldsOf(schema) {
  const shape = /** @type {{ shape?: Record<string, import('zod').ZodType> }} */ (schema).shape;
  if (!shape) return new Set();
  return new Set(
    Object.entries(shape)
      .filter(([, field]) => !field.safeParse('').success && !field.safeParse(undefined).success)
      .map(([name]) => name),
  );
}

/**
 * @param {import('react-hook-form').UseFormReturn<any> | undefined} form A form made with useZodForm.
 * @param {string | undefined} name
 * @returns {boolean} Whether the form's schema requires the field.
 */
export function isRequiredField(form, name) {
  return Boolean(form && name && REQUIRED_FIELDS.get(form.control)?.has(name));
}

/**
 * Puts the API's field errors (`details[].path` like `body.name`) on the matching fields.
 *
 * @param {unknown} error
 * @param {(name: any, error: { message: string }) => void} setError
 * @returns {boolean} Whether at least one field error was applied (the rest is a form-level error).
 */
export function applyServerErrors(error, setError) {
  if (!isApiError(error) || !error.details?.length) return false;
  let applied = false;
  for (const detail of error.details) {
    const field = detail.path.replace(/^body\./, '');
    if (field && field !== detail.path) {
      setError(field, { message: detail.message });
      applied = true;
    }
  }
  return applied;
}
