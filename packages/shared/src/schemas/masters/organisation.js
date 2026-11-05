import { z } from 'zod';

import { optionalEmail, optionalIdSchema, optionalText, requiredText } from '../common.js';
import { addressInputShape, storedAddressShape, storedId, storedText } from './address.js';

/** Column lengths of the legacy tables. */
const LENGTH = Object.freeze({
  name: 100,
  phone: 20,
  email: 50,
  personName: 50,
  website: 500,
  license: 20,
});

// --- Hospitals -------------------------------------------------------------------------------

export const hospitalInputSchema = z.object({
  name: requiredText(LENGTH.name),
  license: optionalText(100),
  phone: optionalText(LENGTH.phone),
  contactNumber: optionalText(LENGTH.phone),
  helpline: optionalText(LENGTH.phone),
  email: optionalEmail(LENGTH.email),
  fax: optionalText(LENGTH.phone),
  website: optionalText(50),
  ...addressInputShape,
});

export const hospitalSchema = z.object({
  id: z.number().int(),
  active: z.boolean(),
  name: z.string(),
  license: storedText,
  phone: storedText,
  contactNumber: storedText,
  helpline: storedText,
  email: storedText,
  fax: storedText,
  website: storedText,
  ...storedAddressShape,
});

// --- Providers (prescribers) -----------------------------------------------------------------

/** Legacy GENDER_CD values. */
export const GENDERS = Object.freeze({ FEMALE: 'F', MALE: 'M' });

export const providerInputSchema = z.object({
  firstName: requiredText(LENGTH.personName),
  middleName: optionalText(LENGTH.personName),
  lastName: requiredText(LENGTH.personName),
  gender: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.enum([GENDERS.FEMALE, GENDERS.MALE]).nullable(),
  ),
  // Optional: most legacy prescribers have none on file, and a required field would block every edit.
  licenseNumber: optionalText(LENGTH.license),
  providerTypeId: optionalIdSchema,
  speciality: optionalText(50),
  hospitalId: optionalIdSchema,
  phone: optionalText(LENGTH.phone),
  email: optionalEmail(LENGTH.email),
  ...addressInputShape,
});

export const providerSchema = z.object({
  id: z.number().int(),
  active: z.boolean(),
  firstName: z.string(),
  middleName: storedText,
  lastName: z.string(),
  gender: z.string().nullable(),
  licenseNumber: storedText,
  providerTypeId: storedId,
  providerTypeName: storedText,
  speciality: storedText,
  hospitalId: storedId,
  hospitalName: storedText,
  phone: storedText,
  email: storedText,
  ...storedAddressShape,
});

// --- Terms and conditions --------------------------------------------------------------------

/** Longest terms text accepted (MySQL TEXT holds 65,535 bytes). */
const MAX_TERMS_LENGTH = 20_000;

export const termsInputSchema = z.object({
  text: requiredText(MAX_TERMS_LENGTH),
});

export const termsSchema = z.object({
  id: z.number().int(),
  active: z.boolean(),
  text: z.string(),
});

// --- Pharmacy profile ------------------------------------------------------------------------

/** Legacy Y/N flags edited as booleans. */
const flag = z.boolean();

export const pharmacyProfileInputSchema = z.object({
  name: requiredText(250),
  taxId: requiredText(LENGTH.license),
  phone: requiredText(LENGTH.phone),
  email: optionalEmail(LENGTH.email).pipe(z.string({ error: 'This field is required' })),
  contactFirstName: requiredText(LENGTH.personName),
  contactMiddleName: optionalText(LENGTH.personName),
  contactLastName: optionalText(LENGTH.personName),
  contactEmail: optionalEmail(LENGTH.email),
  contactPhone: optionalText(LENGTH.phone),
  website: optionalText(LENGTH.website),
  fax: optionalText(LENGTH.phone),
  bccEmail: optionalEmail(100),
  openAllHours: flag,
  purchaseOrderApproval: flag,
  ...addressInputShape,
});

export const pharmacyProfileSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  taxId: z.string(),
  phone: z.string(),
  email: z.string(),
  contactFirstName: z.string(),
  contactMiddleName: storedText,
  contactLastName: storedText,
  contactEmail: storedText,
  contactPhone: storedText,
  website: storedText,
  fax: storedText,
  bccEmail: storedText,
  openAllHours: z.boolean(),
  purchaseOrderApproval: z.boolean(),
  hasLogo: z.boolean(),
  ...storedAddressShape,
});

/** Logo upload: the image types browsers display, up to 1 MB. */
export const LOGO_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_LOGO_BYTES = 1024 * 1024;
