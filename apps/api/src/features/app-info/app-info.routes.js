import { readFileSync } from 'node:fs';

import { dataResponseSchema } from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { createAppInfoRepository } from './app-info.repository.js';

const { version: API_VERSION } = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
);

const appInfoSchema = z.object({
  apiVersion: z.string(),
  pharmacy: z
    .object({
      id: z.number().int(),
      name: z.string(),
      city: z.string().nullable(),
      country: z.string().nullable(),
    })
    .nullable(),
  region: z.object({ locale: z.string(), currency: z.string(), timeZone: z.string() }),
});

/** @typedef {z.infer<typeof appInfoSchema>} AppInfo */

/**
 * Public facts the signed-out pages and formatting need: which pharmacy this is (from its database
 * record) and the regional settings (from configuration). Nothing private.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The app-info route definitions.
 */
export function createAppInfoRoutes({ prisma, config }) {
  const repository = createAppInfoRepository(prisma);
  const { locale, currency, timeZone } = config.region;
  return [
    defineRoute({
      method: 'get',
      path: '/app-info',
      summary: 'Pharmacy and regional settings for this installation',
      tags: ['App'],
      access: 'public',
      responses: { 200: { description: 'App info', schema: dataResponseSchema(appInfoSchema) } },
      handler: async ({ res }) => {
        res.set('Cache-Control', 'public, max-age=300');
        return {
          data: {
            apiVersion: API_VERSION,
            pharmacy: await repository.findPharmacy(config.pharmacyId),
            region: { locale, currency, timeZone },
          },
        };
      },
    }),
  ];
}
