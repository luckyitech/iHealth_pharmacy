import { cn } from '@/lib/utils';

/**
 * @param {React.ComponentProps<'div'>} props
 * @returns {React.JSX.Element}
 */
export function Card({ className, ...props }) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

/**
 * @param {React.ComponentProps<'div'>} props
 * @returns {React.JSX.Element}
 */
export function CardHeader({ className, ...props }) {
  return <div data-slot="card-header" className={cn('grid gap-1.5 px-6', className)} {...props} />;
}

/**
 * @param {React.ComponentProps<'h2'>} props
 * @returns {React.JSX.Element}
 */
export function CardTitle({ className, children, ...props }) {
  return (
    <h2
      data-slot="card-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    >
      {children}
    </h2>
  );
}

/**
 * @param {React.ComponentProps<'p'>} props
 * @returns {React.JSX.Element}
 */
export function CardDescription({ className, ...props }) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * @param {React.ComponentProps<'div'>} props
 * @returns {React.JSX.Element}
 */
export function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}
