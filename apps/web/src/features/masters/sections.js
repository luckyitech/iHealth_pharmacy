import { POLICIES } from '@ihealth/shared/permissions';
import {
  Building2,
  Factory,
  FileText,
  FlaskConical,
  Hospital,
  IdCard,
  Landmark,
  Link2,
  Layers,
  Package,
  Pill,
  Ruler,
  ShieldCheck,
  Stethoscope,
  Tags,
  Truck,
  UserRound,
  Users,
} from 'lucide-react';

/**
 * @typedef {object} MasterSection
 * @property {string} id
 * @property {string} label
 * @property {string} path Relative to /masters.
 * @property {string} group Heading in the Masters menu.
 * @property {import('lucide-react').LucideIcon} icon
 * @property {readonly import('@ihealth/shared/permissions').PermissionDefinition[]} permissions To see it (any one).
 */

/**
 * @param {string} group
 * @param {[id: string, label: string, icon: import('lucide-react').LucideIcon, permissions?: readonly import('@ihealth/shared/permissions').PermissionDefinition[]][]} entries
 *   Permissions default to the masters read policy.
 * @returns {MasterSection[]}
 */
const sections = (group, entries) =>
  entries.map(([id, label, icon, permissions = POLICIES.masters.read]) => ({
    id,
    label,
    path: id,
    group,
    icon,
    permissions,
  }));

/** Master-data screens, in menu order. Each appears only for users with one of its permissions. */
export const MASTER_SECTIONS = Object.freeze([
  // Groups and pages ordered by use, measured on the pharmacy's data (2026-11-05): most used first.
  ...sections('Customers', [['customers', 'Customers', Users]]),
  ...sections('Products', [
    ['items', 'Items', Package],
    ['medicine-types', 'Medicine types', ShieldCheck, POLICIES.masters.write],
    ['item-categories', 'Categories', Tags],
    ['item-groups', 'Groups', Layers],
    ['item-forms', 'Dosage forms', Pill],
    ['generic-names', 'Generic names', FlaskConical],
    ['units-of-measure', 'Units of measure', Ruler],
    ['specializations', 'Specializations', Stethoscope],
  ]),
  ...sections('Suppliers and makers', [
    ['item-suppliers', 'Item suppliers', Link2],
    ['suppliers', 'Suppliers', Truck, POLICIES.suppliers.read],
    ['manufacturers', 'Manufacturers', Factory],
  ]),
  ...sections('Organisation', [
    ['employees', 'Employees', IdCard],
    ['pharmacy-profile', 'Pharmacy profile', Building2],
    ['terms', 'Terms and conditions', FileText],
    ['banks', 'Banks', Landmark],
  ]),
  ...sections('Prescribers', [
    ['providers', 'Providers', UserRound],
    ['hospitals', 'Hospitals', Hospital],
  ]),
]);

/** Everyone who can see at least one master screen can open the Masters area. */
export const MASTERS_AREA_PERMISSIONS = Object.freeze([
  ...new Set(MASTER_SECTIONS.flatMap((section) => section.permissions)),
]);
