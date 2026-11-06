import { POLICIES } from '@ihealth/shared/permissions';
import { History, ScanBarcode, ShieldCheck } from 'lucide-react';

/**
 * @typedef {import('@/app/navigation').NavSubItem} NavSubItem
 */

/**
 * Sales screens, in menu order. Returns join when they are built.
 *
 * @type {readonly NavSubItem[]}
 */
export const SALES_SECTIONS = Object.freeze([
  {
    id: 'sales-new',
    label: 'New sale',
    path: '/sales/new',
    group: 'Sales',
    icon: ScanBarcode,
    permissions: POLICIES.sales.sell,
  },
  {
    id: 'sales-history',
    label: 'Sales history',
    path: '/sales/history',
    group: 'Sales',
    icon: History,
    permissions: POLICIES.sales.read,
  },
  {
    id: 'sales-approvals',
    label: 'Approvals',
    path: '/sales/approvals',
    group: 'Sales',
    icon: ShieldCheck,
    permissions: POLICIES.sales.approve,
  },
]);
