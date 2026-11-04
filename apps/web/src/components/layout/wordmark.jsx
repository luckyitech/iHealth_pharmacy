import { Pill } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The product name with a small pharmacy mark. Text, not an image, so it stays crisp and themeable.
 *
 * @param {{ className?: string, inverted?: boolean }} props
 * @returns {React.JSX.Element}
 */
export function Wordmark({ className, inverted = false }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-base font-semibold tracking-tight',
        className,
      )}
    >
      <Pill
        aria-hidden="true"
        strokeWidth={2.25}
        className={cn('size-[1.1em]', inverted ? 'text-brand-foreground/80' : 'text-primary')}
      />
      <span>
        iHealth
        <span className={inverted ? 'text-brand-foreground/70' : 'text-muted-foreground'}>
          {' '}
          Pharmacy
        </span>
      </span>
    </span>
  );
}
