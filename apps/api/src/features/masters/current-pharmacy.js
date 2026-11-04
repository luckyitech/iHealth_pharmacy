import { notFound } from '../../lib/errors.js';

const ACTIVE = 'Y';

/**
 * Which `pharmacy` row this installation is: the one set by PHARMACY_ID, else the first active one.
 *
 * @param {Readonly<import('../../config/env.js').Config>} config
 * @returns {Record<string, unknown>} Prisma `where` (use with `orderBy: { pharmacyId: 'asc' }`).
 */
export const currentPharmacyWhere = (config) =>
  config.pharmacyId ? { pharmacyId: config.pharmacyId } : { activeS: ACTIVE };

/**
 * @param {import('#db').PrismaClient | import('#db').Prisma.TransactionClient} client
 * @param {Readonly<import('../../config/env.js').Config>} config
 * @returns {Promise<number>} The id of this installation's pharmacy.
 */
export async function currentPharmacyId(client, config) {
  const row = await client.pharmacy.findFirst({
    where: currentPharmacyWhere(config),
    orderBy: { pharmacyId: 'asc' },
    select: { pharmacyId: true },
  });
  if (!row) throw notFound('No pharmacy record found');
  return row.pharmacyId;
}
