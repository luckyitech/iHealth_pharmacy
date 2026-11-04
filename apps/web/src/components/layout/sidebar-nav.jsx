import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { Link, NavLink, useLocation } from 'react-router';

import { visibleNavItems } from '@/app/navigation';
import { Wordmark } from '@/components/layout/wordmark';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermissions } from '@/features/auth/use-permissions';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';

/** @typedef {import('@/app/navigation').NavItem} NavItem */
/** @typedef {import('@/app/navigation').NavSubItem} NavSubItem */

const ROW =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none';
const ACTIVE = 'bg-sidebar-accent text-sidebar-accent-foreground';
const ICON_ONLY = 'justify-center px-0 size-10';

/**
 * The modules the signed-in user may open. Modules they have no permission for are not shown.
 * A module with pages of its own (Masters) is a group that opens in place; with `collapsed`
 * only icons show and the group's pages open in a menu beside it.
 *
 * @param {{ onNavigate?: () => void, collapsed?: boolean }} props
 * @returns {React.JSX.Element}
 */
export function SidebarNav({ onNavigate, collapsed = false }) {
  const { hasAny } = usePermissions();
  return (
    <nav
      aria-label="Main"
      className={cn('flex flex-col gap-1 overflow-y-auto p-3', collapsed && 'items-center px-2')}
    >
      {visibleNavItems(hasAny).map((item) => {
        if (item.children?.length) {
          return collapsed ? (
            <CollapsedGroup key={item.id} item={item} pages={item.children} />
          ) : (
            <NavGroup key={item.id} item={item} pages={item.children} onNavigate={onNavigate} />
          );
        }
        return (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === '/'}
            onClick={onNavigate}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) => cn(ROW, collapsed && ICON_ONLY, isActive && ACTIVE)}
          >
            <item.icon aria-hidden="true" className="size-4 shrink-0" />
            {!collapsed && item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * @param {string} pathname
 * @param {string} path
 * @returns {boolean}
 */
const isWithin = (pathname, path) => pathname === path || pathname.startsWith(`${path}/`);

/**
 * Pages grouped under their headings, in menu order.
 *
 * @param {readonly NavSubItem[]} children
 * @returns {[group: string, pages: NavSubItem[]][]}
 */
function byGroup(children) {
  /** @type {Map<string, NavSubItem[]>} */
  const groups = new Map();
  for (const child of children)
    groups.set(child.group, [...(groups.get(child.group) ?? []), child]);
  return [...groups];
}

/**
 * Opens by itself on the group's pages; once the user opens or closes it, that choice is kept.
 *
 * @param {{ item: NavItem, pages: ReadonlyArray<NavSubItem>, onNavigate?: () => void }} props
 * @returns {React.JSX.Element}
 */
function NavGroup({ item, pages, onNavigate }) {
  const { pathname } = useLocation();
  const choice = useSidebarStore((state) => state.openGroups[item.id]);
  const setGroupOpen = useSidebarStore((state) => state.setGroupOpen);
  const listId = useId();
  const inGroup = isWithin(pathname, item.path);
  const open = inGroup ? choice !== false : choice === true;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setGroupOpen(item.id, !open)}
        className={cn(ROW, inGroup && !open && ACTIVE)}
      >
        <item.icon aria-hidden="true" className="size-4 shrink-0" />
        {item.label}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'ml-auto size-4 text-muted-foreground transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        id={listId}
        hidden={!open}
        className="mt-1 ml-5 grid gap-3 border-l border-sidebar-border pl-2"
      >
        {byGroup(pages).map(([group, groupPages]) => (
          <div key={group} role="group" aria-label={group} className="grid gap-0.5">
            <p
              aria-hidden="true"
              className="px-3 pt-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase"
            >
              {group}
            </p>
            {groupPages.map((page) => (
              <NavLink
                key={page.id}
                to={page.path}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(ROW, 'py-1.5 font-normal', isActive && cn(ACTIVE, 'font-medium'))
                }
              >
                <page.icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                {page.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The icon rail's version of a group: one icon that opens the group's pages in a menu beside it.
 *
 * @param {{ item: NavItem, pages: ReadonlyArray<NavSubItem> }} props
 * @returns {React.JSX.Element}
 */
function CollapsedGroup({ item, pages }) {
  const { pathname } = useLocation();
  const inGroup = isWithin(pathname, item.path);
  const groups = byGroup(pages);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={item.label}
        title={item.label}
        className={cn(ROW, ICON_ONLY, inGroup && ACTIVE)}
      >
        <item.icon aria-hidden="true" className="size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        className="max-h-[80dvh] overflow-y-auto"
      >
        <DropdownMenuLabel>{item.label}</DropdownMenuLabel>
        {groups.map(([group, groupPages]) => (
          <DropdownMenuGroup key={group}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {group}
            </DropdownMenuLabel>
            {groupPages.map((page) => (
              <DropdownMenuItem
                key={page.id}
                asChild
                className={cn(isWithin(pathname, page.path) && 'bg-accent font-medium')}
              >
                <Link
                  to={page.path}
                  aria-current={isWithin(pathname, page.path) ? 'page' : undefined}
                >
                  <page.icon aria-hidden="true" className="text-muted-foreground" />
                  {page.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * @param {{ collapsed?: boolean }} props
 * @returns {React.JSX.Element}
 */
export function Brand({ collapsed = false }) {
  return (
    <div
      className={cn(
        'flex h-14 shrink-0 items-center border-b border-sidebar-border px-5',
        collapsed && 'justify-center px-0',
      )}
    >
      {collapsed ? (
        <Link
          to="/"
          aria-label="iHealth Pharmacy, dashboard"
          className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Wordmark className="[&>span]:sr-only" />
        </Link>
      ) : (
        <Wordmark />
      )}
    </div>
  );
}
