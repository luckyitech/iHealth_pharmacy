import { z } from 'zod';

import {
  dateOnlySchema,
  optionalEmail,
  optionalText,
  requiredIdSchema,
  requiredText,
} from '../common.js';
import { ADDRESS_LENGTH, storedId, storedText } from './address.js';
import { optionalGenderSchema } from './organisation.js';

/** Column lengths of the legacy `customer` table. */
const LENGTH = Object.freeze({
  name: 50,
  phone: 20,
  email: 50,
  postalCode: 20,
  organisation: 50,
  taxNumber: 50,
  contactName: 45,
});

/** Who a customer is: a person, or a company buying on account (legacy `CORPORATE` = 'Y'). */
export const CUSTOMER_KINDS = Object.freeze({ INDIVIDUAL: 'individual', CORPORATE: 'corporate' });

/** Digits, spaces, dashes and an optional leading +, as phone numbers are typed at the till. */
const PHONE_PATTERN = /^\+?[\d\s-]{6,20}$/;

/** Oldest date of birth accepted. */
export const EARLIEST_BIRTH_DATE = '1900-01-01';

const optionalBirthDate = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  dateOnlySchema
    .refine((value) => value >= EARLIEST_BIRTH_DATE, 'Enter a real date of birth')
    .refine((value) => new Date(value) <= new Date(), 'The date of birth cannot be in the future')
    .nullable(),
);

// Required here: what the legacy form required and nearly every stored customer has.
// Date of birth and postal code were also required there but almost no record has them.
export const customerInputSchema = z.object({
  kind: z.enum([CUSTOMER_KINDS.INDIVIDUAL, CUSTOMER_KINDS.CORPORATE]),
  firstName: requiredText(LENGTH.name),
  lastName: optionalText(LENGTH.name),
  // Saved without spaces or dashes, like the stored numbers, so a search by number finds it.
  phone: requiredText(LENGTH.phone)
    .regex(PHONE_PATTERN, 'Enter a phone number, e.g. 0712 345 678')
    .transform((value) => value.replace(/[\s-]/g, '')),
  gender: optionalGenderSchema,
  birthDate: optionalBirthDate,
  email: optionalEmail(LENGTH.email),
  addressLine1: optionalText(ADDRESS_LENGTH.line),
  addressLine2: optionalText(ADDRESS_LENGTH.line),
  city: optionalText(ADDRESS_LENGTH.city),
  zip: optionalText(LENGTH.postalCode),
  countryId: requiredIdSchema('Choose a country'),
  provinceId: requiredIdSchema('Choose a province or county'),
  organisation: optionalText(LENGTH.organisation),
  taxNumber: optionalText(LENGTH.taxNumber),
  contactFirstName: optionalText(LENGTH.contactName),
  contactLastName: optionalText(LENGTH.contactName),
});

export const customerSchema = z.object({
  id: z.number().int(),
  active: z.boolean(),
  kind: z.enum([CUSTOMER_KINDS.INDIVIDUAL, CUSTOMER_KINDS.CORPORATE]),
  firstName: z.string(),
  lastName: storedText,
  phone: z.string(),
  gender: z.string().nullable(),
  birthDate: z.string().nullable(),
  email: storedText,
  addressLine1: storedText,
  addressLine2: storedText,
  city: storedText,
  zip: storedText,
  countryId: storedId,
  provinceId: storedId,
  organisation: storedText,
  taxNumber: storedText,
  contactFirstName: storedText,
  contactLastName: storedText,
});
