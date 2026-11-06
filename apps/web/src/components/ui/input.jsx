import { noAutofill } from '@/lib/autofill';
import { cn } from '@/lib/utils';

/**
 * A text box. Browsers and password managers are kept out of it (see `noAutofill`).
 *
 * @param {React.ComponentProps<'input'>} props
 * @returns {React.JSX.Element}
 */
export function Input({ className, type = 'text', ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/70 aria-invalid:ring-[3px] aria-invalid:ring-destructive/15 md:text-sm',
        className,
      )}
      {...props}
      {...noAutofill(type)}
    />
  );
}
