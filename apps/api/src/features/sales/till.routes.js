import { POLICIES } from '@ihealth/shared/permissions';
import {
  batchSearchQuerySchema,
  batchSearchSchema,
  dataResponseSchema,
  heldSaleBodySchema,
  heldSaleSchema,
  heldSaleSummarySchema,
  idParamsSchema,
  tillCustomerQuerySchema,
  tillCustomerSchema,
  tillSettingsSchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';
import { currentPharmacyId } from '../masters/current-pharmacy.js';
import { todayIn } from './batches.repository.js';
import { createHeldSales } from './held-sales.js';
import { createTillRepository } from './till.repository.js';

const TAGS = ['Sales'];
const HELD = '/sales/held';
const HELD_RESOURCE = 'sales/held';

/**
 * What the sales screen needs besides pricing and completing: finding batches and customers, and
 * holding a sale to serve the next person.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createTillRoutes({ prisma, audit, config }) {
  const till = createTillRepository(prisma);
  const held = createHeldSales({ prisma, config });

  return [
    defineRoute({
      method: 'get',
      path: '/sales/till-settings',
      summary: 'Rules the sales screen shows, such as the discount a cashier may give alone',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      responses: {
        200: { description: 'Till settings', schema: dataResponseSchema(tillSettingsSchema) },
      },
      handler: () => ({
        data: {
          selfDiscountLimit: config.sales.selfDiscountLimit,
          maxHeld: config.sales.maxHeld,
        },
      }),
    }),

    defineRoute({
      method: 'get',
      path: '/sales/batches',
      summary: 'Find batches to sell by barcode, item code, name, generic name or batch number',
      description:
        'Only batches in stock. Each item lists its batches first-to-expire first, expired ones last ' +
        '(marked, they cannot be sold). `scanned` is true when `q` matched a barcode exactly.',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { query: batchSearchQuerySchema },
      responses: {
        200: { description: 'Matching batches', schema: dataResponseSchema(batchSearchSchema) },
      },
      handler: async ({ input }) => ({
        data: await till.searchBatches(input.query.q, {
          pharmacyId: await currentPharmacyId(prisma, config),
          today: todayIn(config.region.timeZone),
          limit: config.sales.searchLimit,
        }),
      }),
    }),

    defineRoute({
      method: 'get',
      path: '/sales/customers',
      summary: 'Find a customer to put on a bill',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { query: tillCustomerQuerySchema },
      responses: {
        200: {
          description: 'Matching customers',
          schema: dataResponseSchema(z.array(tillCustomerSchema)),
        },
      },
      handler: async ({ input }) => ({ data: await till.searchCustomers(input.query.q) }),
    }),

    defineRoute({
      method: 'get',
      path: HELD,
      summary: 'List the sales on hold',
      description:
        'Newest first, for the whole pharmacy: a sale held at one till can be recalled at another.',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      responses: {
        200: {
          description: 'Sales on hold',
          schema: dataResponseSchema(z.array(heldSaleSummarySchema)),
        },
      },
      handler: async () => ({ data: await held.list(await currentPharmacyId(prisma, config)) }),
    }),

    defineRoute({
      method: 'post',
      path: HELD,
      summary: 'Put a sale on hold',
      description:
        'Keeps the batches, quantities, discounts and customer; prices are worked out again on recall.',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { body: heldSaleBodySchema },
      responses: {
        201: { description: 'The held sale', schema: dataResponseSchema(heldSaleSummarySchema) },
      },
      handler: async ({ res, input }) => ({
        data: await held.hold(input.body, {
          employeeId: getAuth(res).employeeId,
          pharmacyId: await currentPharmacyId(prisma, config),
        }),
      }),
    }),

    defineRoute({
      method: 'post',
      path: `${HELD}/:id/recall`,
      summary: 'Take a sale off hold to finish it',
      description: 'Only one till can recall a sale; the next gets 404.',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { params: idParamsSchema },
      responses: {
        200: { description: 'The recalled sale', schema: dataResponseSchema(heldSaleSchema) },
      },
      handler: async ({ input }) => ({
        data: await held.recall(input.params.id, await currentPharmacyId(prisma, config)),
      }),
    }),

    defineRoute({
      method: 'delete',
      path: `${HELD}/:id`,
      summary: 'Discard a sale on hold',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { params: idParamsSchema },
      responses: { 204: { description: 'Discarded' } },
      handler: async ({ req, input }) => {
        await held.discard(input.params.id, await currentPharmacyId(prisma, config));
        await audit.record({
          action: `${HELD_RESOURCE}.discard`,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          resourceType: HELD_RESOURCE,
          resourceId: input.params.id,
          ipAddress: req.ip,
        });
      },
    }),
  ];
}
