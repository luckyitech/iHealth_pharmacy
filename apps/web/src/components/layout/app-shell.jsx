import { Menu } from 'lucide-react';
import { Suspense } from 'react';
import { Link, Outlet } from 'react-router';

import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useSidebarStore } from '@/stores/sidebar-store';

import { CommandPalette } from './command-palette.jsx';
import { PharmacyBrand, PharmacyName } from './pharmacy-brand.jsx';
import { SidePanel } from './side-panel.jsx';
import { MobileNav } from './mobile-nav.jsx';
import { SectionTabs } from './section-tabs.jsx';
import { useSections } from './use-sections.js';
import { ThemeMenu } from './theme-menu.jsx';
import { UserMenu } from './user-menu.jsx';

/**
 * Layout of every signed-in page, in the old system's pattern:
 * - a slim account bar (the pharmacy's logo and name, the account menu) above a teal menu bar with
 *   the main sections;
 * - a left column from the top of the screen: the logo in a cell as tall as both bars, then, for a
 *   section with pages of its own (Masters), those pages as icons sliding out on hover (side-panel.jsx);
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
    // The two top bars are 3rem + 2.75rem from `lg`; the left column's logo cell is as tall.
    <div className="flex min-h-svh bg-background [--header-height:3rem] lg:[--header-height:5.75rem]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <SidePanel section={panelSection} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 shrink-0">
          <div className="flex h-12 items-center gap-2 border-b bg-card/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/75 sm:px-6">
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
              <PharmacyBrand className="lg:hidden" />
              <PharmacyName className="hidden lg:inline" />
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <CommandPalette />
              <ThemeMenu />
              <UserMenu />
            </div>
          </div>
          <div className="hidden h-11 border-b border-nav bg-nav lg:block">
            <SectionTabs />
          </div>
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent title="Navigation">
            <div className="flex h-12 shrink-0 items-center border-b pr-12 pl-5">
              <PharmacyBrand />
            </div>
            <MobileNav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

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
