import { useMemo } from 'react';

import { useCurrentUser } from './use-auth.js';

/** @typedef {import('@ihealth/shared/permissions').PermissionDefinition} PermissionDefinition */

/**
 * Permission checks for showing or hiding UI. The API enforces the same permissions on every request:
 * hiding something here is a convenience, not a security measure.
 *
 * @returns {{ has: (permission: PermissionDefinition) => boolean, hasAny: (permissions: readonly PermissionDefinition[]) => boolean }}
 */
export function usePermissions() {
  const { data: user } = useCurrentUser();
  return useMemo(() => {
    const granted = new Set(user?.permissionIds ?? []);
    return {
      has: (permission) => granted.has(permission.id),
      hasAny: (permissions) =>
        permissions.length === 0 || permissions.some((permission) => granted.has(permission.id)),
    };
  }, [user]);
}
