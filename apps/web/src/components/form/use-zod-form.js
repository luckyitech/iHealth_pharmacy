/* eslint-disable jsdoc/reject-any-type -- generic over every resource: row and form shapes come from each master's Zod schema */
import { zodResolver } from '@hookform/resolvers/zod';
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
  return useForm({
    resolver: zodResolver(/** @type {any} */ (schema)),
    mode: 'onTouched',
    ...options,
  });
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
