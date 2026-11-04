import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/env.js';
import { createAppInfoRoutes } from '../src/features/app-info/app-info.routes.js';
import { buildTestApp, TEST_ENV } from './helpers.js';

const PHARMACIES = [
  { pharmacyId: 1, pharmacyNm: ' Test Pharmacy ', cityNm: 'Test City', countryId: 9, activeS: 'Y' },
  { pharmacyId: 2, pharmacyNm: 'Second Branch', cityNm: null, countryId: null, activeS: 'Y' },
];

const prisma = /** @type {import('@ihealth/db').PrismaClient} */ (
  /** @type {unknown} */ ({
    $queryRaw: async () => [],
    pharmacy: {
      findFirst: async (/** @type {{ where: { pharmacyId?: number } }} */ { where }) =>
        PHARMACIES.find((row) =>
          where.pharmacyId ? row.pharmacyId === where.pharmacyId : row.activeS === 'Y',
        ) ?? null,
    },
    countryLookup: { findUnique: async () => ({ countryNm: 'Testland' }) },
  })
);

/**
 * @param {NodeJS.ProcessEnv} env
 */
const appWith = (env) => {
  const config = loadConfig({ ...TEST_ENV, ...env });
  return buildTestApp({ prisma, config, routes: createAppInfoRoutes({ prisma, config }) });
};

describe('GET /app-info', () => {
  it('returns the pharmacy record and the configured region', async () => {
    const response = await request(
      appWith({ APP_LOCALE: 'sw-TZ', APP_CURRENCY: 'TZS', APP_TIME_ZONE: 'Africa/Dar_es_Salaam' }),
    ).get('/api/v1/app-info');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      apiVersion: expect.any(String),
      pharmacy: { id: 1, name: 'Test Pharmacy', city: 'Test City', country: 'Testland' },
      region: { locale: 'sw-TZ', currency: 'TZS', timeZone: 'Africa/Dar_es_Salaam' },
    });
  });

  it('uses the configured pharmacy when PHARMACY_ID is set', async () => {
    const response = await request(appWith({ PHARMACY_ID: '2' })).get('/api/v1/app-info');
    expect(response.body.data.pharmacy).toEqual({
      id: 2,
      name: 'Second Branch',
      city: null,
      country: null,
    });
  });

  it('treats an empty PHARMACY_ID as not set', () => {
    expect(loadConfig({ ...TEST_ENV, PHARMACY_ID: '' }).pharmacyId).toBeUndefined();
  });
});
