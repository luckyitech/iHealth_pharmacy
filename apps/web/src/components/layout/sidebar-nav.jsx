import { NavLink } from 'react-router';

import { visibleNavItems } from '@/app/navigation';
import { Wordmark } from '@/components/layout/wordmark';
import { usePermissions } from '@/features/auth/use-permissions';
import { cn } from '@/lib/utils';

/**
 * The modules the signed-in user may open. Modules they have no permission for are not shown.
 *
 * @param {{ onNavigate?: () => void }} props
 * @returns {React.JSX.Element}
 */
export function SidebarNav({ onNavigate }) {
  const { hasAny } = usePermissions();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {visibleNavItems(hasAny).map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          end={item.path === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
              isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )
          }
        >
          <item.icon aria-hidden="true" className="size-4 shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * @returns {React.JSX.Element}
 */
export function Brand() {
  return (
    <div className="flex h-14 items-center border-b border-sidebar-border px-5">
      <Wordmark />
    </div>
  );
}
