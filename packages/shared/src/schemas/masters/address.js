import { z } from 'zod';

import { optionalIdSchema, optionalText } from '../common.js';

/** Address columns shared by most legacy master tables (same lengths everywhere). */
export const ADDRESS_LENGTH = Object.freeze({ line: 250, city: 50, zip: 10 });

/** Address fields of a create/edit body. */
export const addressInputShape = Object.freeze({
  addressLine1: optionalText(ADDRESS_LENGTH.line),
  addressLine2: optionalText(ADDRESS_LENGTH.line),
  city: optionalText(ADDRESS_LENGTH.city),
  zip: optionalText(ADDRESS_LENGTH.zip),
  countryId: optionalIdSchema,
  provinceId: optionalIdSchema,
});

export const storedText = z.string().nullable();
export const storedId = z.number().int().nullable();

/** Address fields of a stored record. */
export const storedAddressShape = Object.freeze({
  addressLine1: storedText,
  addressLine2: storedText,
  city: storedText,
  zip: storedText,
  countryId: storedId,
  provinceId: storedId,
});
