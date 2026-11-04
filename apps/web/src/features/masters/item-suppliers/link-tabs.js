import { POLICIES } from '@ihealth/shared/permissions';

import { ItemSuppliersTab, SupplierItemsTab } from './link-list.jsx';

/** The "Suppliers" tab of an item's dialog. */
export const ITEM_SUPPLIERS_TAB = Object.freeze({
  id: 'suppliers',
  label: 'Suppliers',
  permissions: POLICIES.masters.read,
  Component: ItemSuppliersTab,
});

/** The "Items" tab of a supplier's dialog. */
export const SUPPLIER_ITEMS_TAB = Object.freeze({
  id: 'items',
  label: 'Items',
  permissions: POLICIES.masters.read,
  Component: SupplierItemsTab,
});
