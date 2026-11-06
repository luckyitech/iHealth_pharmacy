/**
 * @typedef {import('../../config/env.js').Config['medicine']['types'][number]} MedicineType
 * @typedef {MedicineType['kind']} MedicineKind
 */

/**
 * Which kind of medicine a legacy schedule code stands for, by the pharmacy's settings.
 *
 * @param {readonly MedicineType[]} types
 * @param {unknown} code The item's `schedule_category_code.SCHEDULE_CATEGORY_CODE`.
 * @returns {MedicineKind | null}
 */
export function medicineKindOf(types, code) {
  const text = String(code ?? '')
    .trim()
    .toUpperCase();
  if (!text) return null;
  return types.find((type) => type.code.toUpperCase() === text)?.kind ?? null;
}
