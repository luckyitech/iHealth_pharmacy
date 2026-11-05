import { NavLink } from 'react-router';

import { cn } from '@/lib/utils';

import { useSections } from './use-sections.js';

/** @typedef {import('@/app/navigation').NavItem} NavItem */
/** @typedef {import('@/app/navigation').NavSubItem} NavSubItem */

const ROW =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none';
const ACTIVE =
  'bg-primary font-medium text-primary-foreground hover:bg-primary hover:text-primary-foreground';
const HEADING = 'px-3 pt-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase';

/**
 * Pages grouped under their headings, in menu order.
 *
 * @param {ReadonlyArray<NavSubItem>} pages
 * @returns {[group: string, pages: NavSubItem[]][]}
 */
function byGroup(pages) {
  /** @type {Map<string, NavSubItem[]>} */
  const groups = new Map();
  for (const page of pages) groups.set(page.group, [...(groups.get(page.group) ?? []), page]);
  return [...groups];
}

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
              HEADING,
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
                cn(ROW, 'min-w-0 overflow-hidden whitespace-nowrap', isActive && ACTIVE)
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
              cn(ROW, 'font-medium', isActive && !section.children?.length && ACTIVE)
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
