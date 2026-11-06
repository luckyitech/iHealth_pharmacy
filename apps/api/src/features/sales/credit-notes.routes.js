import { POLICIES } from '@ihealth/shared/permissions';
import { creditNoteLookupSchema, dataResponseSchema } from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { notFound } from '../../lib/errors.js';
import { createCreditNotes } from './credit-notes.js';

/** Longest credit note number (the legacy column). */
const CODE_LENGTH = 20;

const codeParamsSchema = z.object({
  code: z.string().trim().min(1, 'Enter the credit note number').max(CODE_LENGTH),
});

/**
 * Credit notes at the till: looking one up by its number before paying with it.
 *
 * @param {{ prisma: import('#db').PrismaClient, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createCreditNoteRoutes({ prisma, config }) {
  const creditNotes = createCreditNotes({ timeZone: config.region.timeZone });
  return [
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
