/* eslint-disable jsdoc/reject-any-type -- list queries are typed by their Zod schema */
import { POLICIES } from '@ihealth/shared/permissions';
import {
  createListQuerySchema,
  creditNoteListFiltersShape,
  creditNoteLookupSchema,
  creditNoteSummarySchema,
  creditNoteUseSchema,
  dataResponseSchema,
  listResponseSchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { notFound } from '../../lib/errors.js';
import { todayIn } from './batches.repository.js';
import { createCreditNotes } from './credit-notes.js';
import { CREDIT_NOTE_SORTABLE, createReturnsRepository } from './returns.repository.js';

/** Longest credit note number (the legacy column). */
const CODE_LENGTH = 20;

const codeParamsSchema = z.object({
  code: z.string().trim().min(1, 'Enter the credit note number').max(CODE_LENGTH),
});

/**
 * Credit notes: looking one up by its number before paying with it, the list with what is left on
 * each, and each time a note paid for a bill.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createCreditNoteRoutes({ prisma, config }) {
  const creditNotes = createCreditNotes({ timeZone: config.region.timeZone });
  const lists = createReturnsRepository(prisma);
  const listQuery = createListQuerySchema({
    sortable: CREDIT_NOTE_SORTABLE,
    defaultSort: /** @type {any} */ ('-issuedOn'),
    filters: creditNoteListFiltersShape,
  });
  return [
    defineRoute({
      method: 'get',
      path: '/sales/credit-notes',
      summary: 'Credit notes, newest first, with what is left on each',
      description: '`q` searches the note number, the customer and the original bill.',
      tags: ['Sales'],
      permissions: POLICIES.sales.read,
      request: { query: listQuery },
      responses: {
        200: { description: 'Credit notes', schema: listResponseSchema(creditNoteSummarySchema) },
      },
      handler: async ({ input }) => {
        const query = /** @type {any} */ (input.query);
        const { rows, total } = await lists.creditNotes(query, {
          today: todayIn(config.region.timeZone),
        });
        return {
          data: rows,
          meta: {
            page: query.page,
            pageSize: query.pageSize,
            total,
            totalPages: Math.ceil(total / query.pageSize),
          },
        };
      },
    }),

    defineRoute({
      method: 'get',
      path: '/sales/credit-notes/:code/uses',
      summary: 'Each time a credit note paid for a bill',
      tags: ['Sales'],
      permissions: POLICIES.sales.read,
      request: { params: codeParamsSchema },
      responses: {
        200: { description: 'Uses', schema: dataResponseSchema(z.array(creditNoteUseSchema)) },
      },
      handler: async ({ input }) => ({ data: await lists.usesOf(input.params.code) }),
    }),

    defineRoute({
      method: 'get',
      path: '/sales/credit-notes/:code',
      summary: 'A credit note by its number: what is left on it, and whether it can pay',
      description: 'Anyone holding the number may spend it; the till shows whose it is.',
      tags: ['Sales'],
      permissions: POLICIES.sales.sell,
      request: { params: codeParamsSchema },
      responses: {
        200: { description: 'The note', schema: dataResponseSchema(creditNoteLookupSchema) },
      },
      handler: async ({ input }) => {
        const note = await creditNotes.find(prisma, input.params.code);
        if (!note) throw notFound('No credit note has this number');
        return { data: note };
      },
    }),
  ];
}
