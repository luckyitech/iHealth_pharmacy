import { NavLink } from 'react-router';

import { cn } from '@/lib/utils';

import { byGroup, NAV_HEADING, NAV_ROW, NAV_ROW_ACTIVE } from './nav-styles.js';

/** @typedef {import('@/app/navigation').NavItem} NavItem */

/**
 * The current section's pages, grouped under small headings. When not `expanded` the panel is an
 * icon rail: the labels are still there (for screen readers) but clipped, and each icon has a tooltip.
 *
 * @param {{ section: NavItem, expanded?: boolean, onNavigate?: () => void }} props
 * @returns {React.JSX.Element}
 */
export function SectionNav({ section, expanded = true, onNavigate }) {
  return (
    <nav aria-label={section.label} className="grid content-start gap-3 p-3">
      {byGroup(section.children ?? []).map(([group, pages]) => (
        <div key={group} role="group" aria-label={group} className="grid gap-0.5">
          <p
            aria-hidden="true"
            className={cn(
              NAV_HEADING,
              'truncate transition-opacity motion-reduce:transition-none',
              !expanded && 'opacity-0',
            )}
          >
            {group}
          </p>
          {pages.map((page) => (
            <NavLink
              key={page.id}
              to={page.path}
              onClick={onNavigate}
              title={expanded ? undefined : page.label}
              className={({ isActive }) =>
                cn(NAV_ROW, 'min-w-0 overflow-hidden whitespace-nowrap', isActive && NAV_ROW_ACTIVE)
              }
            >
              <page.icon aria-hidden="true" className="size-4 shrink-0" />
              <span
                className={cn(
                  'truncate transition-opacity motion-reduce:transition-none',
                  !expanded && 'opacity-0',
                )}
              >
                {page.label}
              </span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
