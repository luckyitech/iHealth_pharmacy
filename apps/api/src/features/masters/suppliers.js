/* eslint-disable jsdoc/reject-any-type -- items come from the generic CRUD factory */
import { POLICIES } from '@ihealth/shared/permissions';
import {
  SUPPLIER_FLAGS,
  supplierInputSchema,
  supplierSchema,
  SUPPLIES_KINDS,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { ADDRESS_COLUMNS, columnMapping, LEGACY_STAMPS, text } from './legacy-mapping.js';

const FLAG_YES = 'Y';
const FLAG_NO = 'N';

/**
 * Legacy `SUPPLIES_MEDICAL_NON_MEDICAL_BOTH` values.
 *
 * @type {Readonly<Record<string, string>>}
 */
const LEGACY_SUPPLIES = Object.freeze({
  [SUPPLIES_KINDS.MEDICAL]: 'M',
  [SUPPLIES_KINDS.NON_MEDICAL]: 'N',
  [SUPPLIES_KINDS.BOTH]: 'B',
});

/** API field -> `supplier` column (Prisma field), for text and id fields. */
const COLUMNS = Object.freeze({
  name: 'spName',
  // Labelled "TIN No" on the legacy form; holds the KRA PIN.
  taxPin: 'license',
  // Labelled "SL No" on the legacy form.
  registrationNumber: 'slNo',
  phone: 'phoneNbr',
  email: 'emailId',
  fax: 'fax',
  website: 'website',
  contactFirstName: 'contactPersonFirstNm',
  contactMiddleName: 'contactPersonMiddleNm',
  contactLastName: 'contactPersonLastNm',
  contactPhone: 'contactPersonPhoneNbr',
  contactEmail: 'contactPersonEmailId',
  contactEmail2: 'contactPersonEmailTwo',
  contactEmail3: 'contactPersonEmailThree',
  contactEmail4: 'contactPersonEmailFour',
  ...ADDRESS_COLUMNS,
  paymentTypeId: 'paymentTypeId',
  paymentTerms: 'paymentTerms',
  bankName: 'bankName',
  accountNumber: 'accountNumber',
  returnCreditTypeId: 'returnCreditTypeId',
});

/** Whole-number columns (not ids). */
const NUMBERS = Object.freeze({
  creditDays: 'paymentCreditNetDays',
  lateInterestPercent: 'latePaymentInterest',
});

/** API flag -> `supplier` Y/N column. */
const FLAGS = Object.freeze({
  alsoManufacturer: 'supplierAlsoManufacturer',
  allowOnlineOrders: 'allowOnlineOrders',
  allowManualOrders: 'allowManualOrders',
  allowPhoneOrders: 'allowPhoneOrders',
  acceptExpiryReturns: 'acceptExpiryReturns',
  acceptDamagedReturns: 'acceptDamagedReturns',
  acceptGoodReturns: 'acceptGoodReturns',
});

const MAPPING = columnMapping('supplierId', COLUMNS, ['name']);

/** @type {Record<string, boolean>} */
const SELECT = {
  ...MAPPING.select,
  suppliesMedicalNonMedicalBoth: true,
  ...Object.fromEntries(
    [...Object.values(NUMBERS), ...Object.values(FLAGS)].map((column) => [column, true]),
  ),
};

/**
 * @param {Record<string, any>} row
 * @returns {Record<string, unknown>}
 */
function toItem(row) {
  const supplies = row.suppliesMedicalNonMedicalBoth?.toUpperCase();
  return {
    ...MAPPING.toItem(row),
    supplies:
      Object.keys(LEGACY_SUPPLIES).find((kind) => LEGACY_SUPPLIES[kind] === supplies) ??
      SUPPLIES_KINDS.BOTH,
    ...Object.fromEntries(
      Object.entries(NUMBERS).map(([field, column]) => [field, row[column] ?? null]),
    ),
    ...Object.fromEntries(
      SUPPLIER_FLAGS.map((flag) => [
        flag,
        row[FLAGS[/** @type {keyof typeof FLAGS} */ (flag)]]?.toUpperCase() === FLAG_YES,
      ]),
    ),
  };
}

/**
 * @param {Record<string, any>} input
 * @returns {Record<string, unknown>}
 */
function toData(input) {
  /** @type {Record<string, unknown>} */
  const data = MAPPING.toData(input);
  if (input.supplies) data.suppliesMedicalNonMedicalBoth = LEGACY_SUPPLIES[input.supplies];
  for (const [field, column] of Object.entries(NUMBERS))
    if (field in input) data[column] = input[field];
  for (const [flag, column] of Object.entries(FLAGS))
    if (flag in input) data[column] = input[flag] ? FLAG_YES : FLAG_NO;
  return data;
}

/**
 * Adds the names of each supplier's payment type and return-credit type.
 *
 * @param {Record<string, any>[]} items
 * @param {any} prisma
 * @returns {Promise<Record<string, any>[]>}
 */
async function withNames(items, prisma) {
  const [paymentTypes, creditTypes] = await Promise.all([
    prisma.paymentTypes.findMany({ select: { paymentTypeId: true, type: true } }),
    prisma.returnCreditType.findMany({ select: { returnCreditTypeId: true, type: true } }),
  ]);
  const paymentNames = new Map(
    paymentTypes.map((/** @type {any} */ row) => [row.paymentTypeId, text(row.type)]),
  );
  const creditNames = new Map(
    creditTypes.map((/** @type {any} */ row) => [row.returnCreditTypeId, text(row.type)]),
  );
  return items.map((item) => ({
    ...item,
    paymentTypeName: paymentNames.get(item.paymentTypeId) ?? null,
    returnCreditTypeName: creditNames.get(item.returnCreditTypeId) ?? null,
  }));
}

/**
 * Suppliers (distributors) the pharmacy buys from. Read by "Masters View"; changed by
 * "Masters Entry" or the narrower legacy "Update Supplier" permission.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog }} deps
 * @returns The supplier routes.
 */
export function createSupplierRoutes(deps) {
  return createCrudRoutes(
    {
      resource: 'masters/suppliers',
      label: 'Supplier',
      tag: 'Masters',
      delegate: (client) => client.supplier,
      idField: 'supplierId',
      permissions: POLICIES.suppliers,
      itemSchema: supplierSchema,
      inputSchema: supplierInputSchema,
      select: SELECT,
      toItem,
      toData,
      enrich: withNames,
      sortable: ['name', 'city', 'creditDays'],
      sortColumns: { name: 'spName', city: 'cityNm', creditDays: 'paymentCreditNetDays' },
      defaultSort: 'name',
      search: (q) => ({
        OR: [
          { spName: { contains: q } },
          { license: { contains: q } },
          { phoneNbr: { contains: q } },
          { contactPersonFirstNm: { contains: q } },
          { contactPersonLastNm: { contains: q } },
        ],
      }),
      filters: {
        shape: {
          supplies: z
            .enum([SUPPLIES_KINDS.MEDICAL, SUPPLIES_KINDS.NON_MEDICAL, SUPPLIES_KINDS.BOTH])
            .optional(),
        },
        toWhere: (query) =>
          query.supplies ? { suppliesMedicalNonMedicalBoth: LEGACY_SUPPLIES[query.supplies] } : {},
      },
      activeField: 'activeS',
      unique: [
        {
          field: 'name',
          where: (input) => (input.name ? { spName: input.name } : null),
          message: 'A supplier with this name already exists',
        },
        {
          field: 'taxPin',
          where: (input) => (input.taxPin ? { license: input.taxPin } : null),
          message: 'A supplier with this tax PIN already exists',
        },
      ],
      stamps: LEGACY_STAMPS,
    },
    deps,
  );
}
