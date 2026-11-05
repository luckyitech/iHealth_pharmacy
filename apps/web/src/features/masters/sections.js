import { POLICIES } from '@ihealth/shared/permissions';
import { Factory, FlaskConical, Layers, Pill, Ruler, Stethoscope, Tags } from 'lucide-react';

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
      id: 'item-categories',
      label: 'Categories',
      path: 'item-categories',
      group: 'Products',
      description: 'Product categories',
      icon: Tags,
      permissions: POLICIES.masters.read,
    },
    {
      id: 'item-groups',
      label: 'Groups',
      path: 'item-groups',
      group: 'Products',
      description: 'Item groups',
      icon: Layers,
      permissions: POLICIES.masters.read,
    },
    {
      id: 'item-forms',
      label: 'Dosage forms',
      path: 'item-forms',
      group: 'Products',
      description: 'Dosage forms',
      icon: Pill,
      permissions: POLICIES.masters.read,
    },
    {
      id: 'generic-names',
      label: 'Generic names',
      path: 'generic-names',
      group: 'Products',
      description: 'Active ingredients',
      icon: FlaskConical,
      permissions: POLICIES.masters.read,
    },
    {
      id: 'units-of-measure',
      label: 'Units of measure',
      path: 'units-of-measure',
      group: 'Products',
      description: 'Units',
      icon: Ruler,
      permissions: POLICIES.masters.read,
    },
    {
      id: 'specializations',
      label: 'Specializations',
      path: 'specializations',
      group: 'Products',
      description: 'Specialties',
      icon: Stethoscope,
      permissions: POLICIES.masters.read,
    },
    {
      id: 'manufacturers',
      label: 'Manufacturers',
      path: 'manufacturers',
      group: 'Suppliers and makers',
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
