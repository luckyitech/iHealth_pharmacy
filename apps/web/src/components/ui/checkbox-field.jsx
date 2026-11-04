import { useId } from 'react';

import { cn } from '@/lib/utils';

/**
 * A native checkbox with its label and an optional description, styled to the design system.
 *
 * @param {React.ComponentProps<'input'> & { label: string, description?: string }} props
 * @returns {React.JSX.Element}
 */
export function CheckboxField({ label, description, className, ...props }) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        {...props}
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
