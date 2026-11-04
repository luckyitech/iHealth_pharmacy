import { POLICIES } from '@ihealth/shared/permissions';
import {
  Building2,
  Factory,
  FileText,
  FlaskConical,
  Hospital,
  Layers,
  Pill,
  Ruler,
  Stethoscope,
  Tags,
  UserRound,
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
 * @param {[id: string, label: string, icon: import('lucide-react').LucideIcon][]} entries
 * @returns {MasterSection[]}
 */
const sections = (group, entries) =>
  entries.map(([id, label, icon]) => ({
    id,
    label,
    path: id,
    group,
    icon,
    permissions: POLICIES.masters.read,
  }));

/** Master-data screens, in menu order. Each appears only for users with one of its permissions. */
export const MASTER_SECTIONS = Object.freeze([
  ...sections('Organisation', [
    ['pharmacy-profile', 'Pharmacy profile', Building2],
    ['terms', 'Terms and conditions', FileText],
  ]),
  ...sections('Products', [
    ['item-categories', 'Categories', Tags],
    ['item-groups', 'Groups', Layers],
    ['item-forms', 'Dosage forms', Pill],
    ['generic-names', 'Generic names', FlaskConical],
    ['units-of-measure', 'Units of measure', Ruler],
    ['specializations', 'Specializations', Stethoscope],
  ]),
  ...sections('Suppliers and makers', [['manufacturers', 'Manufacturers', Factory]]),
  ...sections('Prescribers', [
    ['hospitals', 'Hospitals', Hospital],
    ['providers', 'Providers', UserRound],
  ]),
]);

/** Everyone who can see at least one master screen can open the Masters area. */
export const MASTERS_AREA_PERMISSIONS = Object.freeze([
  ...new Set(MASTER_SECTIONS.flatMap((section) => section.permissions)),
]);
