import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A styled native `<select>`: fully accessible and keyboard-friendly, with the OS picker on phones.
 *
 * @param {React.ComponentProps<'select'>} props
 * @returns {React.JSX.Element}
 */
export function NativeSelect({ className, children, ...props }) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-input bg-background py-2 pr-9 pl-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/70 aria-invalid:ring-[3px] aria-invalid:ring-destructive/15 md:text-sm',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
