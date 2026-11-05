import { Menu } from 'lucide-react';
import { Suspense } from 'react';
import { Outlet } from 'react-router';

import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSidebarStore } from '@/stores/sidebar-store';

import { Brand, SidebarNav } from './sidebar-nav.jsx';
import { ThemeMenu } from './theme-menu.jsx';
import { UserMenu } from './user-menu.jsx';

/**
 * Layout of every signed-in page: a fixed sidebar on desktop, a drawer on phones, and a top bar.
 *
 * @returns {React.JSX.Element}
 */
export function AppShell() {
  const mobileOpen = useSidebarStore((state) => state.mobileOpen);
  const setMobileOpen = useSidebarStore((state) => state.setMobileOpen);

  return (
    <div className="min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        <SidebarNav />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent title="Navigation">
          <Brand />
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
          className="mx-auto w-full max-w-7xl p-4 outline-none sm:p-6 lg:p-8"
        >
          <Suspense fallback={<PageState state="loading" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
