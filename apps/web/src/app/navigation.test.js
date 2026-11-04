import { PERMISSIONS } from '@ihealth/shared/permissions';
import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, visibleNavItems } from './navigation.js';

/**
 * @param {number[]} ids
 * @returns {(permissions: readonly { id: number }[]) => boolean}
 */
const grant = (ids) => (permissions) =>
  permissions.length === 0 || permissions.some((p) => ids.includes(p.id));

describe('navigation', () => {
  it('shows only the dashboard to a user without permissions', () => {
    expect(visibleNavItems(grant([])).map((item) => item.id)).toEqual(['dashboard']);
  });

  it('shows a module when the user has any permission of its groups', () => {
    const ids = visibleNavItems(grant([PERMISSIONS.SALES_SALES_BILLING_SUBMISSION.id])).map(
      (item) => item.id,
    );
    expect(ids).toEqual(['dashboard', 'sales']);
  });

  it('gives every permission to at most one module, and covers every non-master group', () => {
    const covered = NAV_ITEMS.flatMap((item) =>
      item.permissions.map((permission) => permission.id),
    );
    expect(new Set(covered).size).toBe(covered.length);
    // Master-group permissions open the Masters screens they belong to (see features/masters/sections.js).
    const nonMaster = Object.values(PERMISSIONS).filter(
      (permission) => permission.group !== 'Master',
    );
    expect(nonMaster.every((permission) => covered.includes(permission.id))).toBe(true);
  });
});
