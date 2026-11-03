import { create } from 'zustand';

/** @typedef {{ mobileOpen: boolean, setMobileOpen: (open: boolean) => void }} SidebarState */

/**
 * Whether the mobile navigation drawer is open. Desktop navigation is always visible.
 */
export const useSidebarStore = create(
  /** @type {import('zustand').StateCreator<SidebarState>} */ (
    (set) => ({
      mobileOpen: false,
      setMobileOpen: (open) => set({ mobileOpen: open }),
    })
  ),
);
