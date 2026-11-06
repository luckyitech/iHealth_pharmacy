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
  // Anyone who sold or approved in the legacy Sales module may look up past bills.
  sales: Object.freeze({
    // Pricing and completing a sale: the legacy "Sales Billing Submission".
    sell: Object.freeze([PERMISSIONS.SALES_SALES_BILLING_SUBMISSION]),
    // Taking a cheque (new): given at first to the people who approve sales.
    acceptCheque: Object.freeze([PERMISSIONS.SALES_ACCEPT_CHEQUE_PAYMENTS]),
    // Approving what a cashier may not do alone (new): given at first to managers and super admins.
    approve: Object.freeze([PERMISSIONS.SALES_SALES_APPROVAL]),
    // Approving a sales return: the legacy "Sales Return Approval", now really checked.
    approveReturn: Object.freeze([PERMISSIONS.SALES_SALES_RETURN_APPROVAL]),
    // Reading the controlled-drug register (new): given at first to pharmacists and managers.
    controlledRegister: Object.freeze([PERMISSIONS.SALES_CONTROLLED_DRUG_REGISTER]),
    read: Object.freeze([
      PERMISSIONS.SALES_SALES_BILLING_SUBMISSION,
      PERMISSIONS.SALES_SALES_BILLING_BONUS_ITEMS_APPROVAL,
      PERMISSIONS.SALES_SALES_RETURN_APPROVAL,
    ]),
  }),
  // Sign-in, role and permissions of staff: changing who can do what is a "Masters Entry" task.
  employeeAccess: Object.freeze({
    read: Object.freeze([PERMISSIONS.MASTER_MASTERS_ENTRY]),
    write: Object.freeze([PERMISSIONS.MASTER_MASTERS_ENTRY]),
  }),
  employeePasswords: Object.freeze({
    write: Object.freeze([
      PERMISSIONS.MASTER_MASTERS_ENTRY,
      PERMISSIONS.MASTER_EMPLOYEE_PASSWORD_CHANGE,
    ]),
  }),
});
