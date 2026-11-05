import { Label as LabelPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * @param {React.ComponentProps<typeof LabelPrimitive.Root>} props
 * @returns {React.JSX.Element}
 */
export function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'text-sm leading-none font-medium select-none peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
