import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** @typedef {'light' | 'dark' | 'system'} ThemePreference */
/** @typedef {{ theme: ThemePreference, setTheme: (theme: ThemePreference) => void }} ThemeState */

export const THEMES = Object.freeze(/** @type {const} */ (['light', 'dark', 'system']));

/**
 * Client-only UI preference, so it lives in Zustand (persisted), not in the server-state cache.
 */
export const useThemeStore = create(
  persist(
    /** @type {import('zustand').StateCreator<ThemeState, [['zustand/persist', unknown]]>} */ (
      (set) => ({
        theme: 'system',
        setTheme: (theme) => set({ theme }),
      })
    ),
    { name: 'ihealth-theme' },
  ),
);

/**
 * @param {ThemePreference} theme
 * @returns {boolean}
 */
export function prefersDark(theme) {
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return theme === 'dark';
}
