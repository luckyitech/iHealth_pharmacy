/**
 * @typedef {object} PharmacyProfile
 * @property {number} id
 * @property {string} name
 * @property {string | null} city
 * @property {string | null} country
 */

/**
 * @param {import('#db').PrismaClient} prisma
 * @returns {{ findPharmacy: (pharmacyId: number | undefined) => Promise<PharmacyProfile | null> }}
 */
export function createAppInfoRepository(prisma) {
  return {
    async findPharmacy(pharmacyId) {
      const pharmacy = await prisma.pharmacy.findFirst({
        where: pharmacyId ? { pharmacyId } : { activeS: 'Y' },
        orderBy: { pharmacyId: 'asc' },
        select: { pharmacyId: true, pharmacyNm: true, cityNm: true, countryId: true },
      });
      if (!pharmacy) return null;
      const country = pharmacy.countryId
        ? await prisma.countryLookup.findUnique({
            where: { countryId: pharmacy.countryId },
            select: { countryNm: true },
          })
        : null;
      return {
        id: pharmacy.pharmacyId,
        name: pharmacy.pharmacyNm.trim(),
        city: pharmacy.cityNm?.trim() || null,
        country: country?.countryNm?.trim() || null,
      };
    },
  };
}
