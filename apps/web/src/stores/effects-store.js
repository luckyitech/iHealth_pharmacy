import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * @typedef {object} EffectsState
 * @property {Record<number, boolean>} reducedBy Whether each employee (by id) turned effects off.
 * @property {(employeeId: number, reduced: boolean) => void} setReduced
 */

/**
 * "Reduce effects": no animations, slides or see-through blur, remembered per person on this device.
 */
export const useEffectsStore = create(
  persist(
    /** @type {import('zustand').StateCreator<EffectsState, [['zustand/persist', unknown]]>} */ (
      (set) => ({
        reducedBy: {},
        setReduced: (employeeId, reduced) =>
          set((state) => ({ reducedBy: { ...state.reducedBy, [employeeId]: reduced } })),
      })
    ),
    { name: 'ihealth-effects' },
  ),
);

/** Attribute on `<html>` that the stylesheet uses to turn effects off. */
export const REDUCE_EFFECTS_ATTRIBUTE = 'data-reduce-effects';
