import { POLICIES } from '@ihealth/shared/permissions';
import { dataResponseSchema, idSchema } from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { isActive, text } from '../masters/legacy-mapping.js';
import { taxCategoryLabel } from '../masters/items.js';

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
 * @param {string | null} code
 * @param {string | null} description
 * @returns {string | null} e.g. "H1: Antibiotics, anti-TB drugs"; null for the legacy blank rows.
 */
function codeAndDescription(code, description) {
  const parts = [text(code), text(description)].filter(Boolean);
  return parts.length ? parts.join(': ') : null;
}

/**
 * Read-only reference lists used by forms (countries, provinces, provider types, tax categories,
 * schedule and Latin codes, payment and return-credit types, employee types), from the legacy
 * lookup tables.
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
    defineRoute({
      method: 'get',
      path: '/lookups/tax-categories',
      summary: 'Active tax (VAT) categories',
      tags: ['Lookups'],
      permissions: LOOKUP_PERMISSIONS,
      responses: { 200: { description: 'Tax categories', schema: optionsResponse } },
      handler: async () => {
        const rows = await prisma.taxcategory.findMany({
          select: { taxcategoryId: true, categoryCode: true, categoryValue: true, activeS: true },
          orderBy: { categoryCode: 'asc' },
        });
        return {
          data: options(
            rows
              // Unlike most lookups, a tax category without the flag is a retired rate.
              .filter((row) => row.activeS?.toUpperCase() === 'Y')
              .map((row) => ({ id: row.taxcategoryId, name: taxCategoryLabel(row) })),
          ),
        };
      },
    }),
    defineRoute({
      method: 'get',
      path: '/lookups/schedule-codes',
      summary: 'Drug schedule categories',
      tags: ['Lookups'],
      permissions: LOOKUP_PERMISSIONS,
      responses: { 200: { description: 'Schedule codes', schema: optionsResponse } },
      handler: async () => {
        const rows = await prisma.scheduleCategoryCode.findMany({
          select: {
            scheduleCategoryCodeId: true,
            scheduleCategoryCode: true,
            scheduleCategoryDesc: true,
            activeS: true,
          },
          orderBy: { scheduleCategoryCode: 'asc' },
        });
        return {
          data: options(
            rows
              .filter((row) => isActive(row.activeS))
              .map((row) => ({
                id: row.scheduleCategoryCodeId,
                name: codeAndDescription(row.scheduleCategoryCode, row.scheduleCategoryDesc),
              })),
          ),
        };
      },
    }),
    defineRoute({
      method: 'get',
      path: '/lookups/latin-codes',
      summary: 'Latin prescription abbreviations (e.g. "bd: twice a day")',
      tags: ['Lookups'],
      permissions: LOOKUP_PERMISSIONS,
      responses: { 200: { description: 'Latin codes', schema: optionsResponse } },
      handler: async () => {
        const rows = await prisma.latinShortCodes.findMany({
          select: {
            latinShortCodeId: true,
            latinShortCode: true,
            latinShortCodeDesc: true,
            activeS: true,
          },
          orderBy: { latinShortCode: 'asc' },
        });
        return {
          data: options(
            rows
              .filter((row) => isActive(row.activeS))
              .map((row) => ({
                id: row.latinShortCodeId,
                name: codeAndDescription(row.latinShortCode, row.latinShortCodeDesc),
              })),
          ),
        };
      },
    }),
    defineRoute({
      method: 'get',
      path: '/lookups/payment-types',
      summary: 'Ways of paying (cash, cheque, M-Pesa, ...)',
      tags: ['Lookups'],
      permissions: LOOKUP_PERMISSIONS,
      responses: { 200: { description: 'Payment types', schema: optionsResponse } },
      handler: async () => {
        const rows = await prisma.paymentTypes.findMany({
          select: { paymentTypeId: true, type: true },
          orderBy: { type: 'asc' },
        });
        return { data: options(rows.map((row) => ({ id: row.paymentTypeId, name: row.type }))) };
      },
    }),
    defineRoute({
      method: 'get',
      path: '/lookups/return-credit-types',
      summary: 'How a supplier credits returned goods (cash, goods, credit note, both)',
      tags: ['Lookups'],
      permissions: LOOKUP_PERMISSIONS,
      responses: { 200: { description: 'Return credit types', schema: optionsResponse } },
      handler: async () => {
        const rows = await prisma.returnCreditType.findMany({
          select: { returnCreditTypeId: true, type: true },
          orderBy: { returnCreditTypeId: 'asc' },
        });
        return {
          data: options(rows.map((row) => ({ id: row.returnCreditTypeId, name: row.type }))),
        };
      },
    }),
    defineRoute({
      method: 'get',
      path: '/lookups/employee-types',
      summary: 'Employee types (pharmacist, technician, ...)',
      tags: ['Lookups'],
      permissions: LOOKUP_PERMISSIONS,
      responses: { 200: { description: 'Employee types', schema: optionsResponse } },
      handler: async () => {
        const rows = await prisma.employeeTypeLookup.findMany({
          select: { employeeTypeLookupId: true, employeeTypeDesc: true },
          orderBy: { employeeTypeDesc: 'asc' },
        });
        return {
          data: options(
            rows.map((row) => ({ id: row.employeeTypeLookupId, name: row.employeeTypeDesc })),
          ),
        };
      },
    }),
  ];
}
