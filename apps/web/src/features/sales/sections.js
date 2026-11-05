import { POLICIES } from '@ihealth/shared/permissions';
import { History } from 'lucide-react';

/**
 * @typedef {import('@/app/navigation').NavSubItem} NavSubItem
 */

/**
 * Sales screens, in menu order. Billing and returns join as they are built.
 *
 * @type {readonly NavSubItem[]}
 */
export const SALES_SECTIONS = Object.freeze([
  {
    id: 'sales-history',
    label: 'Sales history',
    path: '/sales/history',
    group: 'Sales',
    icon: History,
    permissions: POLICIES.sales.read,
  },
]);
