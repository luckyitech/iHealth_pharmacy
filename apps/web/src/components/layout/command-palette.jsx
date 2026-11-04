import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';

import { useSections } from './use-sections.js';

const SHORTCUT_KEY = 'k';
const ITEM =
  'flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground';
const HEADING =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';

/**
 * @returns {boolean} The device is a Mac, where the shortcut uses ⌘ instead of Ctrl.
 */
const isMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * Quick page search: Ctrl+K (⌘K on a Mac), or the search button in the account bar, opens a box
 * that finds any page the user may open by typing part of its name, section or group.
 *
 * @returns {React.JSX.Element}
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { sections } = useSections();
  const navigate = useNavigate();

  useEffect(() => {
    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() === SHORTCUT_KEY && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /** @param {string} path */
  const go = (path) => {
    setOpen(false);
    void navigate(path);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden w-56 justify-start gap-2 text-muted-foreground sm:inline-flex"
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden="true" />
        Find a page…
        <kbd className="ml-auto rounded border px-1.5 font-sans text-[0.7rem]">
          {isMac() ? '⌘K' : 'Ctrl K'}
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Find a page"
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden="true" />
      </Button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Find a page"
        overlayClassName="fixed inset-0 z-50 bg-black/40"
        contentClassName="fixed top-[15dvh] left-1/2 z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b px-4">
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          <Command.Input
            placeholder="Type a page, e.g. suppliers"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Command.List className={`max-h-[min(60dvh,26rem)] overflow-y-auto p-2 ${HEADING}`}>
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
            No page matches.
          </Command.Empty>
          <Command.Group heading="Sections">
            {sections.map((section) => (
              <Command.Item
                key={section.id}
                value={section.label}
                keywords={[section.description]}
                onSelect={() => go(section.path)}
                className={ITEM}
              >
                <section.icon aria-hidden="true" className="size-4 text-muted-foreground" />
                {section.label}
              </Command.Item>
            ))}
          </Command.Group>
          {sections
            .filter((section) => section.children?.length)
            .map((section) => (
              <Command.Group key={section.id} heading={section.label}>
                {section.children?.map((page) => (
                  <Command.Item
                    key={page.id}
                    value={`${section.label} ${page.label}`}
                    keywords={[page.group]}
                    onSelect={() => go(page.path)}
                    className={ITEM}
                  >
                    <page.icon aria-hidden="true" className="size-4 text-muted-foreground" />
                    {page.label}
                    <span className="ml-auto text-xs text-muted-foreground">{page.group}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
