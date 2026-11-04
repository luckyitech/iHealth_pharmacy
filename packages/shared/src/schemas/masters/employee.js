import { z } from 'zod';

import {
  calendarDateSchema,
  optionalEmail,
  optionalText,
  requiredIdSchema,
  requiredPhone,
  requiredText,
} from '../common.js';
import { ADDRESS_LENGTH, storedId, storedText } from './address.js';
import { GENDERS } from './organisation.js';

/** Column lengths of the legacy `employee` table. */
const LENGTH = Object.freeze({
  name: 50,
  phone: 20,
  email: 50,
  designation: 250,
  statutoryNumber: 20,
  postalCode: 20,
});

/** Titles offered by the legacy form (TITLE). */
export const EMPLOYEE_TITLES = Object.freeze(['Mr', 'Ms']);

/** Legacy EMPLOYEE_TYPE_FULL_PART_TIME, free text there ("full", "Part time"). */
export const EMPLOYMENT_TYPES = Object.freeze({ FULL_TIME: 'fullTime', PART_TIME: 'partTime' });

const employmentTypeSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.enum([EMPLOYMENT_TYPES.FULL_TIME, EMPLOYMENT_TYPES.PART_TIME]).nullable(),
);

// Required here: what the legacy form required and nearly every stored employee has (90% or more).
// Salary, documents and the photo are not part of this record: see DEVIATIONS.md.
export const employeeInputSchema = z.object({
  title: z.enum(EMPLOYEE_TITLES, { error: 'Choose a title' }),
  firstName: requiredText(LENGTH.name),
  middleName: optionalText(LENGTH.name),
  lastName: requiredText(LENGTH.name),
  gender: z.enum([GENDERS.FEMALE, GENDERS.MALE], { error: 'Choose a gender' }),
  birthDate: calendarDateSchema({ label: 'date of birth', required: true, notInFuture: true }),
  phone: requiredPhone(LENGTH.phone),
  landline: optionalText(LENGTH.phone),
  email: optionalEmail(LENGTH.email),
  designation: requiredText(LENGTH.designation),
  employeeTypeId: requiredIdSchema('Choose an employee type'),
  employment: employmentTypeSchema,
  joiningDate: calendarDateSchema({ label: 'date of joining', required: true }),
  worksShifts: z.boolean(),
  nssfNumber: requiredText(LENGTH.statutoryNumber),
  nhifNumber: optionalText(LENGTH.statutoryNumber),
  kraPin: optionalText(LENGTH.statutoryNumber),
  idNumber: optionalText(LENGTH.statutoryNumber),
  bloodGroup: optionalText(LENGTH.statutoryNumber),
  postBox: optionalText(LENGTH.statutoryNumber),
  addressLine1: optionalText(ADDRESS_LENGTH.line),
  addressLine2: optionalText(ADDRESS_LENGTH.line),
  city: optionalText(ADDRESS_LENGTH.city),
  zip: requiredText(LENGTH.postalCode),
  countryId: requiredIdSchema('Choose a country'),
  provinceId: requiredIdSchema('Choose a province or county'),
});

export const employeeSchema = z.object({
  id: z.number().int(),
  active: z.boolean(),
  // Generated when the employee is created; never edited.
  code: storedText,
  title: storedText,
  firstName: z.string(),
  middleName: storedText,
  lastName: z.string(),
  gender: z.string().nullable(),
  birthDate: z.string().nullable(),
  phone: storedText,
  landline: storedText,
  email: storedText,
  designation: storedText,
  employeeTypeId: storedId,
  employeeTypeName: storedText,
  employment: z.enum([EMPLOYMENT_TYPES.FULL_TIME, EMPLOYMENT_TYPES.PART_TIME]).nullable(),
  joiningDate: z.string().nullable(),
  worksShifts: z.boolean(),
  nssfNumber: storedText,
  nhifNumber: storedText,
  kraPin: storedText,
  idNumber: storedText,
  bloodGroup: storedText,
  postBox: storedText,
  addressLine1: storedText,
  addressLine2: storedText,
  city: storedText,
  zip: storedText,
  countryId: storedId,
  provinceId: storedId,
});
