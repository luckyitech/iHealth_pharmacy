/* eslint-disable jsdoc/reject-any-type -- items come from the generic CRUD factory */
import { POLICIES } from '@ihealth/shared/permissions';
import { EMPLOYMENT_TYPES, employeeInputSchema, employeeSchema } from '@ihealth/shared/schemas';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { DOCUMENT_KINDS, nextDocumentCode } from '../document-codes/document-codes.js';
import { currentPharmacyId } from './current-pharmacy.js';
import { columnMapping, LEGACY_STAMPS, legacyDates, text, toLegacyDate } from './legacy-mapping.js';

const FLAG_YES = 'Y';
const FLAG_NO = 'N';

/**
 * How employment types are written to the free-text legacy column.
 *
 * @type {Readonly<Record<string, string>>}
 */
const LEGACY_EMPLOYMENT = Object.freeze({
  [EMPLOYMENT_TYPES.FULL_TIME]: 'Full time',
  [EMPLOYMENT_TYPES.PART_TIME]: 'Part time',
});

/** API field -> `employee` column (Prisma field), for text and id fields. */
const COLUMNS = Object.freeze({
  code: 'employeeCd',
  title: 'title',
  firstName: 'firstNm',
  middleName: 'middleNm',
  lastName: 'lastNm',
  gender: 'genderCd',
  phone: 'phoneNbr',
  landline: 'landlineNumber',
  email: 'emailId',
  designation: 'designationNm',
  employeeTypeId: 'employeeTypeLookupId',
  nssfNumber: 'nssfNo',
  nhifNumber: 'nhifNo',
  kraPin: 'kraPin',
  idNumber: 'identificationNo',
  bloodGroup: 'bloodGroup',
  postBox: 'postBox',
  addressLine1: 'addressLine1',
  addressLine2: 'addressLine2',
  city: 'cityNm',
  zip: 'postalCd',
  countryId: 'countryId',
  provinceId: 'provincesId',
});

const MAPPING = columnMapping('employeeId', COLUMNS, ['firstName', 'lastName']);

/** @type {Record<string, boolean>} */
const SELECT = { ...MAPPING.select, employeeTypeFullPartTime: true, areYouWorkOnShifts: true };

/**
 * @param {string | null | undefined} value Legacy free text such as "full", "Part time".
 * @returns {string | null}
 */
function employmentType(value) {
  const normalised = text(value)?.toLowerCase();
  if (normalised?.startsWith('full')) return EMPLOYMENT_TYPES.FULL_TIME;
  if (normalised?.startsWith('part')) return EMPLOYMENT_TYPES.PART_TIME;
  return null;
}

/**
 * @param {Record<string, any>} row
 * @returns {Record<string, unknown>}
 */
function toItem(row) {
  const item = MAPPING.toItem(row);
  return {
    ...item,
    gender: /** @type {string | null} */ (item.gender)?.toUpperCase() ?? null,
    employment: employmentType(row.employeeTypeFullPartTime),
    worksShifts: row.areYouWorkOnShifts?.trim().toUpperCase() === FLAG_YES,
    birthDate: null,
    joiningDate: null,
  };
}

/**
 * @param {Record<string, any>} input
 * @returns {Record<string, unknown>}
 */
function toData(input) {
  /** @type {Record<string, unknown>} */
  const data = MAPPING.toData(input);
  if ('employment' in input)
    data.employeeTypeFullPartTime = input.employment ? LEGACY_EMPLOYMENT[input.employment] : null;
  if ('worksShifts' in input) data.areYouWorkOnShifts = input.worksShifts ? FLAG_YES : FLAG_NO;
  if ('birthDate' in input) data.dobDt = toLegacyDate(input.birthDate);
  if ('joiningDate' in input) data.dateOfJoining = toLegacyDate(input.joiningDate);
  return data;
}

const withDates = legacyDates('employee', 'EMPLOYEE_ID', {
  birthDate: 'DOB_DT',
  joiningDate: 'DATE_OF_JOINING',
});

/**
 * Adds each employee's dates (read as text) and the name of their employee type.
 *
 * @param {Record<string, any>[]} items
 * @param {any} prisma
 * @returns {Promise<Record<string, any>[]>}
 */
async function withDetails(items, prisma) {
  const dated = await withDates(items, prisma);
  const types = await prisma.employeeTypeLookup.findMany({
    select: { employeeTypeLookupId: true, employeeTypeDesc: true },
  });
  const names = new Map(
    types.map((/** @type {any} */ row) => [row.employeeTypeLookupId, text(row.employeeTypeDesc)]),
  );
  return dated.map((item) => ({
    ...item,
    employeeTypeName: names.get(item.employeeTypeId) ?? null,
  }));
}

/**
 * Staff records: who works at the pharmacy. Sign-in details, role and permissions are managed
 * separately (they live in other tables).
 *
 * Salary, documents (ID, contract, CV, police certificate) and the photo are not part of this
 * resource: they are HR and payroll data, not needed to run the pharmacy.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The employee routes.
 */
export function createEmployeeRoutes({ prisma, audit, config }) {
  return createCrudRoutes(
    {
      resource: 'masters/employees',
      label: 'Employee',
      tag: 'Masters',
      delegate: (client) => client.employee,
      idField: 'employeeId',
      permissions: POLICIES.masters,
      itemSchema: employeeSchema,
      inputSchema: employeeInputSchema,
      select: SELECT,
      toItem,
      toData,
      enrich: withDetails,
      sortable: ['firstName', 'lastName', 'code'],
      sortColumns: { firstName: 'firstNm', lastName: 'lastNm', code: 'employeeCd' },
      defaultSort: 'firstName',
      search: (q) => ({
        OR: [
          { firstNm: { contains: q } },
          { lastNm: { contains: q } },
          { employeeCd: { contains: q } },
          { phoneNbr: { contains: q } },
          { designationNm: { contains: q } },
        ],
      }),
      activeField: 'activeS',
      unique: [
        {
          field: 'nssfNumber',
          where: (input) => (input.nssfNumber ? { nssfNo: input.nssfNumber } : null),
          message: 'An employee with this NSSF number already exists',
        },
      ],
      stamps: LEGACY_STAMPS,
      createDefaults: async (tx) => ({
        pharmacyId: await currentPharmacyId(tx, config),
        employeeCd: await nextDocumentCode(tx, DOCUMENT_KINDS.EMPLOYEE, {
          prefix: config.documentCodePrefix,
          timeZone: config.region.timeZone,
        }),
      }),
    },
    { prisma, audit },
  );
}
