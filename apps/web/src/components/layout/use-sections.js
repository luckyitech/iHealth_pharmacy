import { useLocation } from 'react-router';

import { visibleNavItems } from '@/app/navigation';
import { usePermissions } from '@/features/auth/use-permissions';

/** @typedef {import('@/app/navigation').NavItem} NavItem */

/**
 * @param {string} pathname
 * @param {string} path
 * @returns {boolean}
 */
const isWithin = (pathname, path) =>
  path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);

/**
 * The modules the signed-in user may open, and the one the current page belongs to.
 *
 * @returns {{ sections: NavItem[], current: NavItem | undefined }}
 */
export function useSections() {
  const { hasAny } = usePermissions();
  const { pathname } = useLocation();
  const sections = visibleNavItems(hasAny);
  return { sections, current: sections.find((section) => isWithin(pathname, section.path)) };
}
