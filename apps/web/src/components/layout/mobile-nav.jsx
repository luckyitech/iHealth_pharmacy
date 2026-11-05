import { NavLink } from 'react-router';

import { cn } from '@/lib/utils';

import { NAV_ROW, NAV_ROW_ACTIVE } from './nav-styles.js';
import { SectionNav } from './section-nav.jsx';
import { useSections } from './use-sections.js';

/**
 * The phone menu: every section, with the current section's pages listed under it.
 *
 * @param {{ onNavigate: () => void }} props
 * @returns {React.JSX.Element}
 */
export function MobileNav({ onNavigate }) {
  const { sections, current } = useSections();
  return (
    <nav aria-label="Main" className="grid content-start gap-1 overflow-y-auto p-3">
      {sections.map((section) => (
        <div key={section.id} className="grid gap-1">
          <NavLink
            to={section.path}
            end={section.path === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(NAV_ROW, 'font-medium', isActive && !section.children?.length && NAV_ROW_ACTIVE)
            }
          >
            <section.icon aria-hidden="true" className="size-4 shrink-0" />
            {section.label}
          </NavLink>
          {section === current && section.children?.length ? (
            <div className="mb-2 ml-5 border-l border-sidebar-border">
              <SectionNav section={section} onNavigate={onNavigate} />
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
