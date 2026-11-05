import { describe, expect, it } from 'vitest';

import {
  getPermissionById,
  groupPermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  PERMISSION_LIST,
  PERMISSIONS,
} from './index.js';

describe('permissions', () => {
  it('mirrors the legacy pharma_access catalogue', () => {
    expect(PERMISSION_LIST).toHaveLength(125);
    expect(PERMISSIONS.SALES_SALES_BILLING_SUBMISSION).toMatchObject({
      id: 6,
      group: 'Sales',
      name: 'Sales Billing Submission',
    });
    expect(new Set(PERMISSION_LIST.map((permission) => permission.id)).size).toBe(125);
  });

  it('looks permissions up by legacy id', () => {
    expect(getPermissionById(6)).toBe(PERMISSIONS.SALES_SALES_BILLING_SUBMISSION);
    expect(getPermissionById(-1)).toBeUndefined();
  });

  it('groups by legacy menu group', () => {
    const groups = groupPermissions();
    expect(groups.get('Sales')?.every((permission) => permission.group === 'Sales')).toBe(true);
  });

  it('checks granted ids', () => {
    const granted = new Set([6, 8]);
    expect(hasPermission(granted, PERMISSIONS.SALES_SALES_BILLING_SUBMISSION)).toBe(true);
    expect(hasPermission(granted, PERMISSIONS.MASTER_MASTERS_ENTRY)).toBe(false);
    expect(
      hasAnyPermission(granted, [
        PERMISSIONS.MASTER_MASTERS_ENTRY,
        PERMISSIONS.SALES_SALES_RETURN_APPROVAL,
      ]),
    ).toBe(true);
    expect(
      hasAllPermissions(granted, [
        PERMISSIONS.MASTER_MASTERS_ENTRY,
        PERMISSIONS.SALES_SALES_RETURN_APPROVAL,
      ]),
    ).toBe(false);
  });
});
