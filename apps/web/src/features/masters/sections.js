import { POLICIES } from '@ihealth/shared/permissions';
import { Factory } from 'lucide-react';

/**
 * @typedef {object} MasterSection
 * @property {string} id
 * @property {string} label
 * @property {string} path Relative to /masters.
 * @property {string} group Heading in the Masters menu.
 * @property {string} description
 * @property {import('lucide-react').LucideIcon} icon
 * @property {readonly import('@ihealth/shared/permissions').PermissionDefinition[]} permissions To see it (any one).
 */

/** Master-data screens, in menu order. Each appears only for users with one of its permissions. */
export const MASTER_SECTIONS = Object.freeze(
  /** @type {MasterSection[]} */ ([
    {
      id: 'manufacturers',
      label: 'Manufacturers',
      path: 'manufacturers',
      group: 'Products',
      description: 'Companies that make the products you stock',
      icon: Factory,
      permissions: POLICIES.masters.read,
    },
  ]),
);

/** Everyone who can see at least one master screen can open the Masters area. */
export const MASTERS_AREA_PERMISSIONS = Object.freeze([
  ...new Set(MASTER_SECTIONS.flatMap((section) => section.permissions)),
]);
