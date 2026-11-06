import { SALES_SETTING_KEYS } from '@ihealth/shared/schemas';

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
  return {
    /**
     * @param {number} pharmacyId
     * @returns {Promise<{ controlledDrugRules: boolean }>}
     */
    async sales(pharmacyId) {
      /** @type {{ value: string }[]} */
      const [row] = await prisma.$queryRaw`
        SELECT SETTING_VALUE AS value FROM ih_pharmacy_setting
        WHERE PHARMACY_ID = ${pharmacyId} AND SETTING_KEY = ${SALES_SETTING_KEYS.CONTROLLED_DRUG_RULES}`;
      return {
        controlledDrugRules: row ? row.value === TRUE : config.sales.controlledDrugRules,
      };
    },

    /**
     * @param {number} pharmacyId
     * @param {{ controlledDrugRules: boolean }} settings
     * @param {number} employeeId
     * @returns {Promise<void>}
     */
    async saveSales(pharmacyId, { controlledDrugRules }, employeeId) {
      await prisma.$executeRaw`
        INSERT INTO ih_pharmacy_setting (PHARMACY_ID, SETTING_KEY, SETTING_VALUE, UPDATED_BY)
        VALUES (${pharmacyId}, ${SALES_SETTING_KEYS.CONTROLLED_DRUG_RULES},
          ${controlledDrugRules ? TRUE : FALSE}, ${employeeId})
        ON DUPLICATE KEY UPDATE SETTING_VALUE = VALUES(SETTING_VALUE), UPDATED_BY = VALUES(UPDATED_BY)`;
    },
  };
}
