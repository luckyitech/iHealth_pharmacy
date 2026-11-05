import { PERMISSIONS } from './definitions.js';

/**
 * Which legacy permissions allow what, per area. The API enforces these on every request; the web
 * app uses the same lists to decide what to show. Any one permission of a list is enough.
 *
 * The legacy app let any of the five "Master" permissions open every master screen and checked
 * nothing on the server. Here "Masters View" (new) only shows master data, "Masters Entry" also
 * changes it, and the narrower legacy permissions add only what their names say.
 */
export const POLICIES = Object.freeze({
  masters: Object.freeze({
    read: Object.freeze([PERMISSIONS.MASTER_MASTERS_VIEW, PERMISSIONS.MASTER_MASTERS_ENTRY]),
    write: Object.freeze([PERMISSIONS.MASTER_MASTERS_ENTRY]),
  }),
  suppliers: Object.freeze({
    read: Object.freeze([
      PERMISSIONS.MASTER_MASTERS_VIEW,
      PERMISSIONS.MASTER_MASTERS_ENTRY,
      PERMISSIONS.MASTER_UPDATE_SUPPLIER,
    ]),
    write: Object.freeze([PERMISSIONS.MASTER_MASTERS_ENTRY, PERMISSIONS.MASTER_UPDATE_SUPPLIER]),
  }),
  employeePasswords: Object.freeze({
    write: Object.freeze([
      PERMISSIONS.MASTER_MASTERS_ENTRY,
      PERMISSIONS.MASTER_EMPLOYEE_PASSWORD_CHANGE,
    ]),
  }),
});
