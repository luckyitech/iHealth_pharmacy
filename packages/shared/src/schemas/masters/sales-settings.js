import { z } from 'zod';

/** How sales settings are stored, one row each per pharmacy. */
export const SALES_SETTING_KEYS = Object.freeze({
  CONTROLLED_DRUG_RULES: 'sales.controlledDrugRules',
});

/**
 * What each pharmacy decides about selling. With the controlled-drug rules on, a controlled drug
 * cannot be sold without the register's details; off, they are asked for but not required, as in
 * the legacy app.
 */
export const salesSettingsSchema = z.object({
  controlledDrugRules: z.boolean(),
});

export const salesSettingsInputSchema = salesSettingsSchema;
