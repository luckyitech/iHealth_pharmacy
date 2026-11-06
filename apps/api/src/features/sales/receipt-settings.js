/** The legacy receipt's row in `reports_mapping`: its closing lines are kept there. */
const LEGACY_RECEIPT_REPORT = 'SALES_RECEIPT';

/**
 * @param {string | null | undefined} json The legacy `FOOTER_CONTENT`: `{ centerContent: [{ text }] }`.
 * @returns {string[]} Its non-empty centre lines, in order.
 */
export function footerLinesOf(json) {
  if (!json) return [];
  try {
    const content = JSON.parse(json);
    return (Array.isArray(content?.centerContent) ? content.centerContent : [])
      .map((/** @type {{ text?: unknown }} */ part) => String(part?.text ?? '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * What the receipt prints besides the bill, read from the legacy tables so both apps print the
 * same: the tax codes in force on the bill's date, and the closing lines of the receipt.
 *
 * @param {import('#db').PrismaClient} prisma
 * @returns The reader.
 */
export function createReceiptSettings(prisma) {
  return {
    /**
     * @param {string} date `YYYY-MM-DD`
     * @returns {Promise<{ code: string, percent: number }[]>} One rate per code, by code.
     */
    async taxCodesOn(date) {
      const day = new Date(`${date}T12:00:00Z`);
      const rows = await prisma.taxcategory.findMany({
        where: { startDate: { lte: day }, endDate: { gte: day } },
        select: { categoryCode: true, categoryValue: true },
        orderBy: { categoryCode: 'asc' },
      });
      /** @type {Map<string, number>} */
      const byCode = new Map();
      for (const row of rows) {
        const code = row.categoryCode?.trim();
        if (code && !byCode.has(code)) byCode.set(code, Number(row.categoryValue ?? 0));
      }
      return [...byCode].map(([code, percent]) => ({ code, percent }));
    },

    /**
     * @returns {Promise<string[]>}
     */
    async footerLines() {
      const row = await prisma.reportsMapping.findFirst({
        where: { reportCode: LEGACY_RECEIPT_REPORT },
        select: { footerContent: true },
      });
      return footerLinesOf(row?.footerContent);
    },
  };
}
