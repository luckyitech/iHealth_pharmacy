import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

import { buttonVariants } from './button-variants.js';

/**
 * @param {React.ComponentProps<'button'> & import('class-variance-authority').VariantProps<typeof buttonVariants> & { asChild?: boolean }} props
 * @returns {React.JSX.Element}
 */
export function Button({ className, variant, size, asChild = false, ...props }) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
