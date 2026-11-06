import { noAutofill } from '@/lib/autofill';
import { cn } from '@/lib/utils';

/**
 * @param {React.ComponentProps<'textarea'>} props
 * @returns {React.JSX.Element}
 */
export function Textarea({ className, ...props }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/70 aria-invalid:ring-[3px] aria-invalid:ring-destructive/15 md:text-sm',
        className,
      )}
      {...props}
      {...noAutofill(undefined)}
    />
  );
}
