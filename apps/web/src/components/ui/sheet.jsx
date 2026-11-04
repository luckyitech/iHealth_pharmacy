import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

/**
 * A panel that slides in from a side: the left for the mobile navigation, the right for record forms.
 * Focus is trapped while open.
 *
 * @param {React.ComponentProps<typeof SheetPrimitive.Content> & { title: string, description?: string, side?: 'left' | 'right', showTitle?: boolean }} props
 * @returns {React.JSX.Element}
 */
export function SheetContent({
  className,
  children,
  title,
  description,
  side = 'left',
  showTitle = false,
  ...props
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <SheetPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex h-full flex-col shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in',
          side === 'left'
            ? 'left-0 w-72 max-w-[85vw] border-r bg-sidebar data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
            : 'right-0 w-full max-w-lg border-l bg-card data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          className,
        )}
        {...props}
      >
        <SheetPrimitive.Title
          className={showTitle ? 'px-6 pt-6 pr-12 text-lg font-semibold' : 'sr-only'}
        >
          {title}
        </SheetPrimitive.Title>
        <SheetPrimitive.Description
          className={
            showTitle && description ? 'px-6 pt-1 text-sm text-muted-foreground' : 'sr-only'
          }
        >
          {description ?? title}
        </SheetPrimitive.Description>
        {children}
        <SheetPrimitive.Close className="absolute top-3 right-3 rounded-sm p-1 opacity-70 hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <X className="size-5" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
