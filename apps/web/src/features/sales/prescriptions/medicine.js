import { MEDICINE_KINDS } from '@ihealth/shared/schemas';

/** The short tag each kind of medicine carries on the till, as pharmacists write them. */
export const MEDICINE_TAGS = Object.freeze({
  [MEDICINE_KINDS.PRESCRIPTION]: 'Rx',
  [MEDICINE_KINDS.CONTROLLED]: 'CD',
  [MEDICINE_KINDS.ANTIBIOTIC]: 'AB',
});

/** Kinds of medicine sold against a prescription. */
export const NEEDS_PRESCRIPTION = Object.freeze(new Set(Object.values(MEDICINE_KINDS)));

/**
 * @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').medicineTypeSchema>} MedicineType
 * @typedef {MedicineType['kind']} MedicineKind
 */
