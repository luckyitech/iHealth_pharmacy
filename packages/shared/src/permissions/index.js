import { PERMISSIONS } from './definitions.js';

export { PERMISSIONS };

/** @typedef {import('./definitions.js').PermissionDefinition} PermissionDefinition */
/** @typedef {keyof typeof PERMISSIONS} PermissionKey */

/** Every permission, ordered by legacy id. */
export const PERMISSION_LIST = Object.freeze(Object.values(PERMISSIONS));

/** @type {Map<number, PermissionDefinition>} */
const byId = new Map(PERMISSION_LIST.map((permission) => [permission.id, permission]));

/**
 * @param {number} id `PHARMA_ACCESS_ID`
 * @returns {PermissionDefinition | undefined}
 */
export function getPermissionById(id) {
  return byId.get(id);
}

/**
 * Permissions grouped by their legacy menu group (`ACCESS_CD`), in legacy order.
 *
 * @returns {Map<string, PermissionDefinition[]>}
 */
export function groupPermissions() {
  /** @type {Map<string, PermissionDefinition[]>} */
  const groups = new Map();
  for (const permission of PERMISSION_LIST) {
    const group = groups.get(permission.group) ?? [];
    group.push(permission);
    groups.set(permission.group, group);
  }
  return groups;
}

/**
 * @param {ReadonlySet<number>} grantedIds Effective permission ids of the user.
 * @param {PermissionDefinition} permission
 * @returns {boolean}
 */
export function hasPermission(grantedIds, permission) {
  return grantedIds.has(permission.id);
}

/**
 * @param {ReadonlySet<number>} grantedIds
 * @param {readonly PermissionDefinition[]} permissions
 * @returns {boolean}
 */
export function hasAnyPermission(grantedIds, permissions) {
  return permissions.some((permission) => grantedIds.has(permission.id));
}

/**
 * @param {ReadonlySet<number>} grantedIds
 * @param {readonly PermissionDefinition[]} permissions
 * @returns {boolean}
 */
export function hasAllPermissions(grantedIds, permissions) {
  return permissions.every((permission) => grantedIds.has(permission.id));
}
