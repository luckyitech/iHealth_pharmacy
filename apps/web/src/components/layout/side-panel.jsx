import { Pin, PinOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores/sidebar-store';

import { SectionNav } from './sidebar-nav.jsx';

/** Short delays so passing over the rail does not open it, and leaving it briefly does not close it. */
const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 250;

/**
 * The desktop side panel: an icon rail that slides out over the page, with labels, while the mouse
 * is on it or the keyboard is in it. On a touch screen the first tap opens it and a tap outside
 * closes it. Pinned, it stays open and the page starts after it.
 *
 * @param {{ section: import('@/app/navigation').NavItem }} props
 * @returns {React.JSX.Element}
 */
export function SidePanel({ section }) {
  const pinned = useSidebarStore((state) => state.pinned);
  const togglePinned = useSidebarStore((state) => state.togglePinned);
  const [hovered, setHovered] = useState(false);
  const timer = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));
  const panel = useRef(/** @type {HTMLDivElement | null} */ (null));
  // Click events do not say reliably in every browser whether they came from a finger.
  const lastPointer = useRef('mouse');
  const expanded = pinned || hovered;

  /**
   * @param {boolean} open
   * @param {number} delay
   */
  const schedule = (open, delay) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(open), delay);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  // A tap outside closes a panel opened by touch.
  useEffect(() => {
    if (!hovered || pinned) return undefined;
    /** @param {PointerEvent} event */
    const closeOutside = (event) => {
      if (
        event.pointerType !== 'mouse' &&
        !panel.current?.contains(/** @type {Node} */ (event.target))
      )
        setHovered(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [hovered, pinned]);

  const PinIcon = pinned ? PinOff : Pin;

  return (
    <aside
      aria-label="Section pages"
      className={cn(
        'sticky top-[var(--header-height)] z-20 hidden h-[calc(100svh-var(--header-height))] shrink-0 transition-[width] duration-200 motion-reduce:transition-none lg:block',
        pinned ? 'w-60' : 'w-16',
      )}
    >
      <div
        ref={panel}
        data-expanded={expanded}
        className={cn(
          'absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-sidebar-border bg-card transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none',
          expanded ? 'w-60' : 'w-16',
          hovered && !pinned && 'shadow-xl',
        )}
        onPointerEnter={(event) => event.pointerType === 'mouse' && schedule(true, OPEN_DELAY_MS)}
        onPointerLeave={(event) => event.pointerType === 'mouse' && schedule(false, CLOSE_DELAY_MS)}
        onPointerDown={(event) => {
          lastPointer.current = event.pointerType;
        }}
        onClickCapture={(event) => {
          // On a touch screen the first tap opens the rail instead of following the link.
          if (!expanded && lastPointer.current !== 'mouse') {
            event.preventDefault();
            setHovered(true);
          }
        }}
        onFocus={(event) => {
          // Only the keyboard opens it on focus; a tap or click is handled above.
          if (/** @type {HTMLElement} */ (event.target).matches(':focus-visible'))
            schedule(true, 0);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(/** @type {Node | null} */ (event.relatedTarget)))
            schedule(false, 0);
        }}
      >
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <SectionNav section={section} expanded={expanded} />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            aria-pressed={pinned}
            title={expanded ? undefined : 'Keep the panel open'}
            onClick={togglePinned}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <PinIcon aria-hidden="true" className="size-4 shrink-0" />
            <span
              className={cn(
                'transition-opacity motion-reduce:transition-none',
                !expanded && 'opacity-0',
              )}
            >
              {pinned ? 'Let the panel slide' : 'Keep the panel open'}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
