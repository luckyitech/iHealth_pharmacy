import { useId } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Label, control, hint and error for one form field, wired for screen readers:
 * the control gets the id, `aria-invalid` and `aria-describedby` through the render prop.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.error]
 * @param {React.ReactNode} [props.hint]
 * @param {boolean} [props.required]
 * @param {string} [props.className]
 * @param {(control: { id: string, 'aria-invalid'?: boolean, 'aria-describedby'?: string, 'aria-required'?: boolean }) => React.ReactNode} props.children
 * @returns {React.JSX.Element}
 */
export function FormField({ label, error, hint, required = false, className, children }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>
        {label}
        {!required && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
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
