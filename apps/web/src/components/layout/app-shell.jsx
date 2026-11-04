import { Menu } from 'lucide-react';
import { Suspense } from 'react';
import { Link, Outlet } from 'react-router';

import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSidebarStore } from '@/stores/sidebar-store';

import { CommandPalette } from './command-palette.jsx';
import { PharmacyBrand } from './pharmacy-brand.jsx';
import { SidePanel } from './side-panel.jsx';
import { MobileNav, SectionTabs } from './sidebar-nav.jsx';
import { useSections } from './use-sections.js';
import { ThemeMenu } from './theme-menu.jsx';
import { UserMenu } from './user-menu.jsx';

/**
 * Layout of every signed-in page, in the old system's pattern:
 * - a slim account bar (the pharmacy's logo and name, the account menu) above a teal menu bar with
 *   the main sections;
 * - for a section with pages of its own (Masters), a side panel listing them, shown as icons and
 *   sliding out on hover (see side-panel.jsx);
 * - on phones, one bar with a menu button that opens the sections and pages in a drawer.
 * Pages start right after the side panel and use the full width.
 *
 * @returns {React.JSX.Element}
 */
export function AppShell() {
  const mobileOpen = useSidebarStore((state) => state.mobileOpen);
  const setMobileOpen = useSidebarStore((state) => state.setMobileOpen);
  const { current } = useSections();
  const panelSection = current?.children?.length ? current : undefined;

  return (
    // The header is 3rem on phones and 3rem + 2.75rem (the menu bar) from `lg`; the panel sits below it.
    <div className="flex min-h-svh flex-col bg-background [--header-height:3rem] lg:[--header-height:5.75rem]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 shrink-0">
        <div className="flex h-12 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <Link
            to="/"
            className="min-w-0 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <PharmacyBrand />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <CommandPalette />
            <ThemeMenu />
            <UserMenu />
          </div>
        </div>
        <div className="hidden h-11 bg-primary px-2 lg:block">
          <SectionTabs />
        </div>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent title="Navigation">
          <div className="flex h-12 shrink-0 items-center border-b border-sidebar-border pr-12 pl-5">
            <PharmacyBrand />
          </div>
          <MobileNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1">
        {panelSection && <SidePanel section={panelSection} />}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-4 outline-none sm:px-6 sm:py-6"
        >
          <Suspense fallback={<PageState state="loading" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
