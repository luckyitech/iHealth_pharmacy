import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Suspense } from 'react';
import { Outlet } from 'react-router';

import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';

import { Brand, SidebarNav } from './sidebar-nav.jsx';
import { ThemeMenu } from './theme-menu.jsx';
import { UserMenu } from './user-menu.jsx';

/**
 * Layout of every signed-in page: a fixed sidebar on desktop (full, or an icon rail), a drawer on
 * phones, and a top bar. Pages start right after the sidebar and use the full width, so wide
 * screens show more of a table instead of an empty margin.
 *
 * @returns {React.JSX.Element}
 */
export function AppShell() {
  const mobileOpen = useSidebarStore((state) => state.mobileOpen);
  const setMobileOpen = useSidebarStore((state) => state.setMobileOpen);
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggleCollapsed = useSidebarStore((state) => state.toggleCollapsed);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className="min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar lg:flex',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <Brand collapsed={collapsed} />
        <SidebarNav collapsed={collapsed} />
        <div
          className={cn(
            'mt-auto border-t border-sidebar-border p-3',
            collapsed && 'flex justify-center px-2',
          )}
        >
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            className={cn('text-muted-foreground', !collapsed && 'w-full justify-start')}
            aria-label={collapsed ? 'Expand sidebar' : undefined}
            title={collapsed ? 'Expand sidebar' : undefined}
            onClick={toggleCollapsed}
          >
            <ToggleIcon aria-hidden="true" />
            {!collapsed && 'Collapse sidebar'}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent title="Navigation">
          <Brand />
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className={collapsed ? 'lg:pl-16' : 'lg:pl-64'}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur sm:px-6 supports-[backdrop-filter]:bg-background/80">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <ThemeMenu />
            <UserMenu />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="w-full min-w-0 px-4 py-4 outline-none sm:px-6 sm:py-6"
        >
          <Suspense fallback={<PageState state="loading" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
