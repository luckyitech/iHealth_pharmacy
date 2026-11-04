import { useContext, useId } from 'react';

import { cn } from '@/lib/utils';

import { FormLayoutContext, sectionAnchor } from './form-layout.js';

/**
 * A titled group of fields. On an edit page it is a card and appears in the page's section
 * section menu, which links to it by `sectionAnchor(title)`.
 *
 * @param {{ title: string, description?: React.ReactNode, children: React.ReactNode, className?: string }} props
 * @returns {React.JSX.Element}
 */
export function FormSection({ title, description, children, className }) {
  const layout = useContext(FormLayoutContext);
  const headingId = useId();
  const card = layout === 'card';
  return (
    <section
      aria-labelledby={headingId}
      id={sectionAnchor(title)}
      className={cn(
        'grid gap-4 scroll-mt-20',
        card && 'rounded-xl border bg-card p-5 shadow-xs sm:p-6',
        className,
      )}
    >
      <div className="grid gap-1">
        <h2
          id={headingId}
          className={cn('font-semibold', card ? 'text-base' : 'text-sm text-muted-foreground')}
        >
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
