import { z } from 'zod';

import { dateOnlySchema, optionalText } from '../common.js';

/**
 * Kinds of medicine the till treats specially. Which legacy schedule code means which kind, and
 * what each is called, are settings of the API.
 */
export const MEDICINE_KINDS = Object.freeze({
  /** Sold against a doctor's prescription. */
  PRESCRIPTION: 'prescription',
  /** Controlled drugs (narcotics and psychotropics), written in the register. */
  CONTROLLED: 'controlled',
  /** Antibiotics: a prescription is asked for, as with prescription-only medicines. */
  ANTIBIOTIC: 'antibiotic',
});

export const medicineKindSchema = z.enum(Object.values(MEDICINE_KINDS)).nullable();

/** A kind of medicine as the pharmacy names it, with the legacy schedule code it is stored as. */
export const medicineTypeSchema = z.object({
  kind: z.enum(Object.values(MEDICINE_KINDS)),
  code: z.string(),
  name: z.string(),
});

/** Image types a prescription photo may be; the till sends a JPEG. */
export const PRESCRIPTION_PHOTO_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

/** Column lengths of the legacy `provider` table. */
const LENGTH = Object.freeze({ name: 50, licenseNumber: 20, phone: 20 });
/** Shortest doctor or hospital search, so a single letter does not list everyone. */
export const MIN_PRESCRIBER_SEARCH_LENGTH = 2;
/** Longest doctor or hospital search. */
const MAX_PRESCRIBER_SEARCH_LENGTH = 50;

export const prescriberQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(MIN_PRESCRIBER_SEARCH_LENGTH, `Type at least ${MIN_PRESCRIBER_SEARCH_LENGTH} characters`)
    .max(MAX_PRESCRIBER_SEARCH_LENGTH, `Use at most ${MAX_PRESCRIBER_SEARCH_LENGTH} characters`),
});

const text = z.string().nullable();

/** A doctor to put on a bill, with their usual hospital. */
export const tillDoctorSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  licenseNumber: text,
  hospitalId: z.number().int().nullable(),
  hospitalName: text,
});

export const tillHospitalSchema = z.object({ id: z.number().int(), name: z.string() });

/** Adding a doctor from the till; the rest of their details are kept under Masters → Providers. */
export const newDoctorBodySchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'Enter the first name')
    .max(LENGTH.name, `Use at most ${LENGTH.name} characters`),
  lastName: z
    .string()
    .trim()
    .min(1, 'Enter the last name')
    .max(LENGTH.name, `Use at most ${LENGTH.name} characters`),
  licenseNumber: optionalText(LENGTH.licenseNumber),
  phone: optionalText(LENGTH.phone),
  hospitalId: z.coerce.number().int().positive().nullish(),
});

/** A photo of the prescription, as a base64 data URL the till made smaller first. */
export const prescriptionPhotoSchema = z
  .string()
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, 'Attach a photo (JPEG or PNG)');

/** The prescription a sale was made against. Every part is optional for prescription-only items. */
export const salePrescriptionSchema = z.object({
  doctorId: z.coerce.number().int().positive().optional(),
  hospitalId: z.coerce.number().int().positive().optional(),
  prescribedOn: dateOnlySchema.optional(),
  photo: prescriptionPhotoSchema.optional(),
});
