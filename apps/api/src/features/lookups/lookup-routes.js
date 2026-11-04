import { POLICIES } from '@ihealth/shared/permissions';
import { dataResponseSchema, idSchema } from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';

const optionSchema = z.object({ id: z.number().int(), name: z.string() });
const optionsResponse = dataResponseSchema(z.array(optionSchema));

/** Everyone who can see any master data may read these lists. */
const LOOKUP_PERMISSIONS = [...new Set([...POLICIES.masters.read, ...POLICIES.suppliers.read])];

/**
 * @param {{ id: number, name: string | null }[]} rows
 * @returns {{ id: number, name: string }[]}
 */
const options = (rows) =>
  rows
    .filter((row) => row.name?.trim())
    .map((row) => ({ id: row.id, name: /** @type {string} */ (row.name).trim() }));

/**
 * Read-only reference lists used by forms (countries, provinces, provider types), from the legacy lookup tables.
 *
 * @param {{ prisma: import('#db').PrismaClient }} deps
 * @returns The lookup routes.
 */
export function createLookupRoutes({ prisma }) {
  return [
    defineRoute({
      method: 'get',
      path: '/lookups/countries',
      summary: 'Countries',
      tags: ['Lookups'],
      permissions: LOOKUP_PERMISSIONS,
      responses: { 200: { description: 'Countries', schema: optionsResponse } },
      handler: async () => {
        const rows = await prisma.countryLookup.findMany({
          select: { countryId: true, countryNm: true },
          orderBy: { countryNm: 'asc' },
        });
        return { data: options(rows.map((row) => ({ id: row.countryId, name: row.countryNm }))) };
      },
    }),
    defineRoute({
      method: 'get',
      path: '/lookups/provinces',
      summary: 'Provinces or states of a country',
      tags: ['Lookups'],
      permissions: LOOKUP_PERMISSIONS,
      request: { query: z.object({ countryId: idSchema }) },
      responses: { 200: { description: 'Provinces', schema: optionsResponse } },
      handler: async ({ input }) => {
        const rows = await prisma.provincesLookup.findMany({
          where: { countryId: input.query.countryId },
          select: { provincesId: true, provincesNm: true },
          orderBy: { provincesNm: 'asc' },
        });
        return {
          data: options(rows.map((row) => ({ id: row.provincesId, name: row.provincesNm }))),
        };
      },
    }),
    defineRoute({
      method: 'get',
      path: '/lookups/provider-types',
      summary: 'Provider (prescriber) types',
      tags: ['Lookups'],
      permissions: LOOKUP_PERMISSIONS,
      responses: { 200: { description: 'Provider types', schema: optionsResponse } },
      handler: async () => {
        const rows = await prisma.providerTypeLookup.findMany({
          select: { providerTypeLookupId: true, providerTypeDesc: true },
          orderBy: { providerTypeDesc: 'asc' },
        });
        return {
          data: options(
            rows.map((row) => ({ id: row.providerTypeLookupId, name: row.providerTypeDesc })),
          ),
        };
      },
    }),
  ];
}
