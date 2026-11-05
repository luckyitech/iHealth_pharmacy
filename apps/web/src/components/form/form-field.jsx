import { useId } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { isRequiredField } from './use-zod-form.js';

/**
 * Label, control, hint and error for one form field, wired for screen readers:
 * the control gets the id, `aria-invalid` and `aria-describedby` through the render prop.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.error]
 * @param {React.ReactNode} [props.hint]
 * @param {boolean} [props.required] Defaults to what the form's schema says about `name`.
 * @param {import('react-hook-form').UseFormReturn<Record<string, unknown>>} [props.form]
 * @param {string} [props.name]
 * @param {string} [props.className]
 * @param {(control: { id: string, 'aria-invalid'?: boolean, 'aria-describedby'?: string, 'aria-required'?: boolean }) => React.ReactNode} props.children
 * @returns {React.JSX.Element}
 */
export function FormField({ label, error, hint, required, form, name, className, children }) {
  const isRequired = required ?? isRequiredField(form, name);
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={id} required={isRequired}>
        {label}
      </Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': isRequired || undefined,
      })}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
