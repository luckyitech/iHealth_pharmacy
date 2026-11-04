import { z } from 'zod';

import {
  optionalEmail,
  optionalIdSchema,
  optionalText,
  requiredIdSchema,
  requiredText,
} from '../common.js';
import {
  ADDRESS_LENGTH,
  addressInputShape,
  storedAddressShape,
  storedId,
  storedText,
} from './address.js';

/** Column lengths of the legacy `supplier` table. */
const LENGTH = Object.freeze({
  name: 100,
  taxPin: 100,
  registration: 20,
  phone: 20,
  email: 100,
  contactEmail: 50,
  personName: 50,
  website: 500,
  zip: 50,
  bankName: 50,
  accountNumber: 30,
  paymentTerms: 5000,
});

/** Legacy `SUPPLIES_MEDICAL_NON_MEDICAL_BOTH`. */
export const SUPPLIES_KINDS = Object.freeze({
  MEDICAL: 'medical',
  NON_MEDICAL: 'nonMedical',
  BOTH: 'both',
});
const suppliesSchema = z.enum([
  SUPPLIES_KINDS.MEDICAL,
  SUPPLIES_KINDS.NON_MEDICAL,
  SUPPLIES_KINDS.BOTH,
]);

/** Longest credit period accepted, in days. */
export const MAX_CREDIT_DAYS = 3650;
/** Highest late-payment interest accepted, in percent. */
export const MAX_LATE_INTEREST_PERCENT = 100;

/**
 * @param {number} max
 * @returns An optional whole number between 0 and `max`; empty becomes `null`.
 */
const optionalWholeNumber = (max) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.coerce
      .number()
      .int('Use a whole number')
      .min(0, 'Cannot be negative')
      .max(max, `Use at most ${max}`)
      .nullable(),
  );

/** The Y/N options of a supplier, edited as checkboxes. */
export const SUPPLIER_FLAGS = Object.freeze([
  'alsoManufacturer',
  'allowOnlineOrders',
  'allowManualOrders',
  'allowPhoneOrders',
  'acceptExpiryReturns',
  'acceptDamagedReturns',
  'acceptGoodReturns',
]);

const flagShape = Object.fromEntries(SUPPLIER_FLAGS.map((flag) => [flag, z.boolean()]));

// Required here: what the legacy form required and nearly every stored supplier has (90% or more).
// Phone, post code and contact person were also required there but are missing on a third of the
// records, so requiring them would block editing those suppliers.
export const supplierInputSchema = z.object({
  name: requiredText(LENGTH.name),
  taxPin: requiredText(LENGTH.taxPin),
  registrationNumber: optionalText(LENGTH.registration),
  supplies: suppliesSchema,
  phone: optionalText(LENGTH.phone),
  email: optionalEmail(LENGTH.email),
  fax: optionalText(LENGTH.phone),
  website: optionalText(LENGTH.website),
  contactFirstName: optionalText(LENGTH.personName),
  contactMiddleName: optionalText(LENGTH.personName),
  contactLastName: optionalText(LENGTH.personName),
  contactPhone: optionalText(LENGTH.phone),
  contactEmail: optionalEmail(LENGTH.contactEmail),
  contactEmail2: optionalEmail(LENGTH.contactEmail),
  contactEmail3: optionalEmail(LENGTH.contactEmail),
  contactEmail4: optionalEmail(LENGTH.contactEmail),
  ...addressInputShape,
  addressLine1: requiredText(ADDRESS_LENGTH.line),
  zip: optionalText(LENGTH.zip),
  countryId: requiredIdSchema('Choose a country'),
  provinceId: requiredIdSchema('Choose a province or state'),
  paymentTypeId: optionalIdSchema,
  creditDays: optionalWholeNumber(MAX_CREDIT_DAYS),
  lateInterestPercent: optionalWholeNumber(MAX_LATE_INTEREST_PERCENT),
  paymentTerms: optionalText(LENGTH.paymentTerms),
  bankName: optionalText(LENGTH.bankName),
  accountNumber: optionalText(LENGTH.accountNumber),
  returnCreditTypeId: requiredIdSchema('Choose how returns are credited'),
  ...flagShape,
});

export const supplierSchema = z.object({
  id: z.number().int(),
  active: z.boolean(),
  name: z.string(),
  taxPin: storedText,
  registrationNumber: storedText,
  supplies: suppliesSchema,
  phone: storedText,
  email: storedText,
  fax: storedText,
  website: storedText,
  contactFirstName: storedText,
  contactMiddleName: storedText,
  contactLastName: storedText,
  contactPhone: storedText,
  contactEmail: storedText,
  contactEmail2: storedText,
  contactEmail3: storedText,
  contactEmail4: storedText,
  ...storedAddressShape,
  paymentTypeId: storedId,
  paymentTypeName: storedText,
  creditDays: storedId,
  lateInterestPercent: storedId,
  paymentTerms: storedText,
  bankName: storedText,
  accountNumber: storedText,
  returnCreditTypeId: storedId,
  returnCreditTypeName: storedText,
  ...flagShape,
});
