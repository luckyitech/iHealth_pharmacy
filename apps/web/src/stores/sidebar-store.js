import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * @typedef {object} SidebarState
 * @property {boolean} mobileOpen The phone drawer is open. Not remembered.
 * @property {boolean} pinned The desktop side panel stays open instead of sliding out on hover.
 * @property {(open: boolean) => void} setMobileOpen
 * @property {() => void} togglePinned
 */

/**
 * Client-only navigation state. Whether the side panel is pinned is remembered between visits.
 */
export const useSidebarStore = create(
  persist(
    /** @type {import('zustand').StateCreator<SidebarState, [['zustand/persist', unknown]]>} */ (
      (set) => ({
        mobileOpen: false,
        pinned: false,
        setMobileOpen: (open) => set({ mobileOpen: open }),
        togglePinned: () => set((state) => ({ pinned: !state.pinned })),
      })
    ),
    { name: 'ihealth-sidebar', partialize: (state) => ({ pinned: state.pinned }) },
  ),
);
