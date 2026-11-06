import { ACTIVITY_ACTIONS, ACTIVITY_SUBJECTS, SALES_SETTING_KEYS } from '@ihealth/shared/schemas';

import { createActivityLog } from '../activity/activity-log.js';

const TRUE = 'true';
const FALSE = 'false';

/**
 * Settings each pharmacy chooses for itself, read with their defaults from the configuration.
 *
 * @param {import('#db').PrismaClient} prisma
 * @param {Readonly<import('../../config/env.js').Config>} config
 * @returns The settings store.
 */
export function createPharmacySettings(prisma, config) {
  const activity = createActivityLog(prisma);

  /**
   * @param {number} pharmacyId
   * @returns {Promise<{ controlledDrugRules: boolean }>}
   */
  async function sales(pharmacyId) {
    /** @type {{ value: string }[]} */
    const [row] = await prisma.$queryRaw`
      SELECT SETTING_VALUE AS value FROM ih_pharmacy_setting
      WHERE PHARMACY_ID = ${pharmacyId} AND SETTING_KEY = ${SALES_SETTING_KEYS.CONTROLLED_DRUG_RULES}`;
    return {
      controlledDrugRules: row ? row.value === TRUE : config.sales.controlledDrugRules,
    };
  }

  return {
    sales,

    /**
     * Saves the settings; a change also gets a line in the settings' history (who, when, from
     * what to what), so earlier changes are never lost.
     *
     * @param {number} pharmacyId
     * @param {{ controlledDrugRules: boolean }} settings
     * @param {number} employeeId
     * @returns {Promise<void>}
     */
    async saveSales(pharmacyId, { controlledDrugRules }, employeeId) {
      const before = await sales(pharmacyId);
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO ih_pharmacy_setting (PHARMACY_ID, SETTING_KEY, SETTING_VALUE, UPDATED_BY)
          VALUES (${pharmacyId}, ${SALES_SETTING_KEYS.CONTROLLED_DRUG_RULES},
            ${controlledDrugRules ? TRUE : FALSE}, ${employeeId})
          ON DUPLICATE KEY UPDATE SETTING_VALUE = VALUES(SETTING_VALUE), UPDATED_BY = VALUES(UPDATED_BY)`;
        if (before.controlledDrugRules !== controlledDrugRules)
          await activity.record(
            {
              subjectType: ACTIVITY_SUBJECTS.PHARMACY_SETTING,
              subjectId: SALES_SETTING_KEYS.CONTROLLED_DRUG_RULES,
              action: ACTIVITY_ACTIONS.SETTING_CHANGED,
              employeeId,
              pharmacyId,
              details: { from: before.controlledDrugRules, to: controlledDrugRules },
            },
            tx,
          );
      });
    },

    /**
     * Changes to the pharmacy's settings, newest first.
     *
     * @param {number} pharmacyId
     * @returns {Promise<import('@ihealth/shared/schemas').ActivityEntry[]>}
     */
    history(pharmacyId) {
      return activity.latest(ACTIVITY_SUBJECTS.PHARMACY_SETTING, {
        pharmacyId,
        limit: config.historyLimit,
      });
    },
  };
}
