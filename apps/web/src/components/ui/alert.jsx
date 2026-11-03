import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive:
          'border-destructive/40 bg-destructive/5 text-destructive [&>svg]:text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/**
 * @param {React.ComponentProps<'div'> & import('class-variance-authority').VariantProps<typeof alertVariants>} props
 * @returns {React.JSX.Element}
 */
export function Alert({ className, variant, ...props }) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

/**
 * @param {React.ComponentProps<'div'>} props
 * @returns {React.JSX.Element}
 */
export function AlertTitle({ className, ...props }) {
  return (
    <div data-slot="alert-title" className={cn('col-start-2 font-medium', className)} {...props} />
  );
}

/**
 * @param {React.ComponentProps<'div'>} props
 * @returns {React.JSX.Element}
 */
export function AlertDescription({ className, ...props }) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 text-sm text-muted-foreground [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}
