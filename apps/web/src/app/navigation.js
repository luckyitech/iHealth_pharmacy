import { PERMISSION_LIST } from '@ihealth/shared/permissions';
import {
  BarChart3,
  Boxes,
  HandCoins,
  LayoutDashboard,
  ScrollText,
  ShoppingCart,
  UsersRound,
} from 'lucide-react';

/** @typedef {import('@ihealth/shared/permissions').PermissionDefinition} PermissionDefinition */

/**
 * @typedef {object} NavItem
 * @property {string} id
 * @property {string} label
 * @property {string} path
 * @property {import('lucide-react').LucideIcon} icon
 * @property {string} description
 * @property {readonly PermissionDefinition[]} permissions Shown when the user has any of these (none = everyone).
 */

/**
 * @param {(group: string) => boolean} matches
 * @returns {readonly PermissionDefinition[]}
 */
const permissionsOf = (matches) =>
  PERMISSION_LIST.filter((permission) => matches(permission.group));

/**
 * The modules of the app, in menu order. Each is gated by the legacy permission groups (`ACCESS_CD`) it covers.
 *
 * @type {readonly NavItem[]}
 */
export const NAV_ITEMS = Object.freeze([
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/',
    icon: LayoutDashboard,
    description: 'Overview of today',
    permissions: [],
  },
  {
    id: 'sales',
    label: 'Sales',
    path: '/sales',
    icon: ShoppingCart,
    description: 'Billing, returns, credit notes and receipts',
    permissions: permissionsOf((group) => group === 'Sales'),
  },
  {
    id: 'stock',
    label: 'Stock',
    path: '/stock',
    icon: Boxes,
    description: 'Purchases, stock adjustments, transfers and scrap',
    permissions: permissionsOf((group) => group === 'Stock' || group === 'Scrap'),
  },
  {
    id: 'finance',
    label: 'Finance',
    path: '/finance',
    icon: HandCoins,
    description: 'Payments, receivables, payables and expenses',
    permissions: permissionsOf((group) => group === 'Finance'),
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/reports',
    icon: ScrollText,
    description: 'Sales, stock, purchase, finance and CRM reports',
    permissions: permissionsOf((group) => group.startsWith('Reports')),
  },
  {
    id: 'charts',
    label: 'Charts',
    path: '/charts',
    icon: BarChart3,
    description: 'Visual trends',
    permissions: permissionsOf((group) => group === 'Charts'),
  },
  {
    id: 'masters',
    label: 'Masters',
    path: '/masters',
    icon: UsersRound,
    description: 'Employees, suppliers, items and settings',
    permissions: permissionsOf((group) => group === 'Master'),
  },
]);

/**
 * @param {(permissions: readonly PermissionDefinition[]) => boolean} hasAny
 * @returns {NavItem[]}
 */
export function visibleNavItems(hasAny) {
  return NAV_ITEMS.filter((item) => hasAny(item.permissions));
}
