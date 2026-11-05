import { NavLink } from 'react-router';

import { cn } from '@/lib/utils';

import { useSections } from './use-sections.js';

/**
 * The main sections across the teal menu bar, as in the old system. Desktop only.
 *
 * @returns {React.JSX.Element}
 */
export function SectionTabs() {
  const { sections } = useSections();
  return (
    <nav aria-label="Main" className="flex h-full items-stretch overflow-x-auto">
      {sections.map((section) => (
        <NavLink
          key={section.id}
          to={section.path}
          end={section.path === '/'}
          className={({ isActive }) =>
            cn(
              'relative flex items-center gap-2 px-4 text-sm font-medium whitespace-nowrap text-nav-foreground/85 transition-colors outline-none hover:bg-nav-foreground/10 hover:text-nav-foreground focus-visible:ring-[3px] focus-visible:ring-nav-foreground/60 focus-visible:ring-inset motion-reduce:transition-none',
              // A section stays marked while any of its pages is open.
              isActive &&
                'bg-nav-foreground/15 text-nav-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-nav-foreground',
            )
          }
        >
          <section.icon aria-hidden="true" className="size-4 shrink-0" />
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
