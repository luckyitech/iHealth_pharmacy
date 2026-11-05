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

const optionalBirthDate = calendarDateSchema({ label: 'date of birth', notInFuture: true });

// Required here: what the legacy form required and nearly every stored customer has.
// Date of birth and postal code were also required there but almost no record has them.
export const customerInputSchema = z.object({
  kind: z.enum([CUSTOMER_KINDS.INDIVIDUAL, CUSTOMER_KINDS.CORPORATE]),
  firstName: requiredText(LENGTH.name),
  lastName: optionalText(LENGTH.name),
  phone: requiredPhone(LENGTH.phone),
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
