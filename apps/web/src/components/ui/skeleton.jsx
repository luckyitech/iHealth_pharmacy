import { cn } from '@/lib/utils';

/**
 * @param {React.ComponentProps<'div'>} props
 * @returns {React.JSX.Element}
 */
export function Skeleton({ className, ...props }) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
