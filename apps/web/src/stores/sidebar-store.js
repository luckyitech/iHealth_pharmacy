import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * @typedef {object} SidebarState
 * @property {boolean} mobileOpen The phone drawer is open. Not remembered.
 * @property {boolean} collapsed The desktop sidebar shows icons only.
 * @property {Record<string, boolean>} openGroups Groups (such as Masters) the user opened or closed, by id.
 * @property {(open: boolean) => void} setMobileOpen
 * @property {() => void} toggleCollapsed
 * @property {(id: string, open: boolean) => void} setGroupOpen
 */

/**
 * Client-only navigation state. The desktop layout choices are remembered between visits.
 */
export const useSidebarStore = create(
  persist(
    /** @type {import('zustand').StateCreator<SidebarState, [['zustand/persist', unknown]]>} */ (
      (set) => ({
        mobileOpen: false,
        collapsed: false,
        openGroups: {},
        setMobileOpen: (open) => set({ mobileOpen: open }),
        toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
        setGroupOpen: (id, open) =>
          set((state) => ({ openGroups: { ...state.openGroups, [id]: open } })),
      })
    ),
    {
      name: 'ihealth-sidebar',
      partialize: (state) => ({ collapsed: state.collapsed, openGroups: state.openGroups }),
    },
  ),
);
