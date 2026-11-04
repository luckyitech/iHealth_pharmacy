import { Label as LabelPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * A form label. `required` adds a red asterisk after it. The asterisk sits outside the label
 * element and is hidden from screen readers: they announce "required" from the control's
 * `aria-required`, and the field's name stays its plain label text.
 *
 * @param {React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }} props
 * @returns {React.JSX.Element}
 */
export function Label({ className, required = false, ...props }) {
  const label = (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'text-sm leading-none font-medium select-none peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
  if (!required) return label;
  return (
    <div className="flex items-baseline gap-0.5">
      {label}
      <span aria-hidden="true" className="text-sm leading-none text-destructive">
        *
      </span>
    </div>
  );
}

/**
 * The note that explains the asterisk, shown once at the top of a form.
 *
 * @returns {React.JSX.Element}
 */
export function RequiredLegend() {
  return (
    <p className="text-sm text-muted-foreground">
      <span aria-hidden="true" className="text-destructive">
        *
      </span>{' '}
      required
    </p>
  );
}
