import { NavLink, Outlet } from 'react-router';

import { usePermissions } from '@/features/auth/use-permissions';
import { cn } from '@/lib/utils';

import { MASTER_SECTIONS } from './sections.js';

/**
 * Masters area: a list of the master screens the user may open, beside the selected screen.
 * On narrow screens the list becomes a horizontal, scrollable strip above it.
 *
 * @returns {React.JSX.Element}
 */
export default function MastersLayout() {
  const { hasAny } = usePermissions();
  const sections = MASTER_SECTIONS.filter((section) => hasAny(section.permissions));
  const groups = [...new Set(sections.map((section) => section.group))];

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav
        aria-label="Masters"
        className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0"
      >
        <div className="flex gap-1 lg:grid lg:gap-5">
          {groups.map((group) => (
            <div key={group} className="contents lg:grid lg:gap-1">
              <p className="hidden px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:block">
                {group}
              </p>
              {sections
                .filter((section) => section.group === group)
                .map((section) => (
                  <NavLink
                    key={section.id}
                    to={section.path}
                    className={({ isActive }) =>
                      cn(
                        'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        isActive && 'bg-accent text-accent-foreground',
                      )
                    }
                  >
                    <section.icon aria-hidden="true" className="size-4 text-muted-foreground" />
                    {section.label}
                  </NavLink>
                ))}
            </div>
          ))}
        </div>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
