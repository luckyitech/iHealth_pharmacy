import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * Quiet by design: the alert sits on the surface it appears on, and colour is limited to a thin
 * left accent and the icon. Text stays in the foreground colour so it reads as a sentence, not a banner.
 */
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 border-l-[3px] py-1 pr-1 pl-3 text-sm has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'border-l-primary text-foreground [&>svg]:text-primary',
        destructive: 'border-l-destructive text-foreground [&>svg]:text-destructive',
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
      className={cn('col-start-2 text-sm leading-relaxed [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}
