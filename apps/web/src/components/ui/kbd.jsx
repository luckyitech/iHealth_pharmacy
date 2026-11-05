import { cn } from '@/lib/utils';

/**
 * A keyboard key, as shown in shortcut hints. Hidden from screen readers when `decorative`.
 *
 * @param {React.ComponentProps<'kbd'> & { decorative?: boolean }} props
 * @returns {React.JSX.Element}
 */
export function Kbd({ className, decorative = false, ...props }) {
  return (
    <kbd
      aria-hidden={decorative || undefined}
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-b-2 bg-background px-1 font-mono text-[11px] font-semibold text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
