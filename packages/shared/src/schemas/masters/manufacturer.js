import { z } from 'zod';

import { optionalEmail, optionalIdSchema, optionalText, requiredText } from '../common.js';

/** Column lengths of the legacy `manufacturer` table. */
const LENGTH = Object.freeze({
  name: 100,
  license: 100,
  phone: 20,
  email: 50,
  website: 500,
  line: 250,
  city: 50,
  zip: 10,
});

/** Create/edit a manufacturer. The update body is the same with every field optional. */
export const manufacturerInputSchema = z.object({
  name: requiredText(LENGTH.name),
  license: optionalText(LENGTH.license),
  phone: optionalText(LENGTH.phone),
  email: optionalEmail(LENGTH.email),
  fax: optionalText(LENGTH.phone),
  website: optionalText(LENGTH.website),
  contactFirstName: optionalText(LENGTH.city),
  contactLastName: optionalText(LENGTH.city),
  contactPhone: optionalText(LENGTH.phone),
  contactEmail: optionalEmail(LENGTH.email),
  addressLine1: optionalText(LENGTH.line),
  addressLine2: optionalText(LENGTH.line),
  city: optionalText(LENGTH.city),
  zip: optionalText(LENGTH.zip),
  countryId: optionalIdSchema,
  provinceId: optionalIdSchema,
});

/** @typedef {z.input<typeof manufacturerInputSchema>} ManufacturerInput */

/**
 * A stored manufacturer as the API returns it. Deliberately looser than the input rules: legacy rows
 * may break today's rules (a missing name, a malformed email) and must still be listed and fixed.
 */
const storedText = z.string().nullable();
const storedId = z.number().int().nullable();

export const manufacturerSchema = z.object({
  id: z.number().int(),
  active: z.boolean(),
  updatedAt: storedText,
  name: z.string(),
  license: storedText,
  phone: storedText,
  email: storedText,
  fax: storedText,
  website: storedText,
  contactFirstName: storedText,
  contactLastName: storedText,
  contactPhone: storedText,
  contactEmail: storedText,
  addressLine1: storedText,
  addressLine2: storedText,
  city: storedText,
  zip: storedText,
  countryId: storedId,
  provinceId: storedId,
});

/** @typedef {z.infer<typeof manufacturerSchema>} Manufacturer */
