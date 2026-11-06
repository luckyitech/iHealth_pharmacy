import { POLICIES } from '@ihealth/shared/permissions';
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_SUBJECTS,
  activityEntrySchema,
  controlledItemSchema,
  controlledRegisterQuerySchema,
  controlledRegisterSchema,
  dataResponseSchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { defineRoute } from '../../http/define-route.js';
import { notFound, validationFailed } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';
import { createActivityLog } from '../activity/activity-log.js';
import { currentPharmacyId } from '../masters/current-pharmacy.js';
import { createControlledRegister } from './controlled-register.js';
import { renderRegister } from './controlled-register-pdf.js';

const PATH = '/sales/controlled-register';
const RESOURCE = 'sales/controlled-register';
const TAGS = ['Sales'];
const MS_PER_DAY = 86_400_000;
/** `YYYY-MM-DD HH:MM` in a time zone, and dates as the pharmacy writes them. */
const LOCAL_STAMP = 'sv-SE'; // hardcode-ok: a locale whose format is ISO-like, used only to build text

/**
 * The controlled-drug register, for pharmacists, managers and inspectors: on screen and as a PDF.
 * Every reading is audited, since it names patients and their ID numbers.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createControlledRegisterRoutes({ prisma, audit, config }) {
  const register = createControlledRegister({ prisma, config });
  const activity = createActivityLog(prisma);

  /**
   * Audited, and kept on the register's history (who read or printed which drug, for which days).
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {'view' | 'print'} action
   * @param {{ itemId: number, from: string, to: string }} query
   * @returns {Promise<void>}
   */
  const record = async (req, res, action, query) => {
    await audit.record({
      action: `${RESOURCE}.${action}`,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      resourceType: RESOURCE,
      resourceId: query.itemId,
      ipAddress: req.ip,
      details: { from: query.from, to: query.to },
    });
    const pharmacyId = await currentPharmacyId(prisma, config);
    const item = await prisma.items.findUnique({
      where: { itemId: query.itemId },
      select: { itemNm: true },
    });
    await activity.record({
      subjectType: ACTIVITY_SUBJECTS.CONTROLLED_REGISTER,
      subjectId: pharmacyId,
      action:
        action === 'print' ? ACTIVITY_ACTIONS.REGISTER_PRINTED : ACTIVITY_ACTIONS.REGISTER_VIEWED,
      employeeId: getAuth(res).employeeId,
      pharmacyId,
      details: {
        itemId: query.itemId,
        itemName: item?.itemNm?.trim() ?? null,
        from: query.from,
        to: query.to,
      },
    });
  };

  /**
   * @param {{ itemId: number, from: string, to: string }} query
   * @returns {Promise<NonNullable<Awaited<ReturnType<typeof register.read>>>>}
   */
  const readOrFail = async (query) => {
    const days = (Date.parse(query.to) - Date.parse(query.from)) / MS_PER_DAY + 1;
    if (days > config.sales.registerMaxDays)
      throw validationFailed([
        { path: 'query.to', message: `Choose at most ${config.sales.registerMaxDays} days` },
      ]);
    const found = await register.read(query, await currentPharmacyId(prisma, config));
    if (!found) throw notFound('This item is not a controlled drug');
    return found;
  };

  return [
    defineRoute({
      method: 'get',
      path: `${PATH}/history`,
      summary: 'Who read or printed the register, and when',
      description: 'Newest first.',
      tags: TAGS,
      permissions: POLICIES.sales.controlledRegister,
      responses: {
        200: { description: 'History', schema: dataResponseSchema(z.array(activityEntrySchema)) },
      },
      handler: async () => {
        const pharmacyId = await currentPharmacyId(prisma, config);
        return {
          data: await activity.latest(ACTIVITY_SUBJECTS.CONTROLLED_REGISTER, {
            pharmacyId,
            limit: config.historyLimit,
          }),
        };
      },
    }),
    defineRoute({
      method: 'get',
      path: `${PATH}/items`,
      summary: 'Controlled drugs, with what is on hand',
      tags: TAGS,
      permissions: POLICIES.sales.controlledRegister,
      responses: {
        200: {
          description: 'Controlled drugs',
          schema: dataResponseSchema(z.array(controlledItemSchema)),
        },
      },
      handler: async () => ({
        data: await register.items(await currentPharmacyId(prisma, config)),
      }),
    }),

    defineRoute({
      method: 'get',
      path: PATH,
      summary: "One controlled drug's register for a period",
      description:
        'Every change to its stock, from the legacy stock history, with who it went to and a running balance.',
      tags: TAGS,
      permissions: POLICIES.sales.controlledRegister,
      request: { query: controlledRegisterQuerySchema },
      responses: {
        200: { description: 'The register', schema: dataResponseSchema(controlledRegisterSchema) },
      },
      handler: async ({ req, res, input }) => {
        const data = await readOrFail(input.query);
        await record(req, res, 'view', input.query);
        return { data };
      },
    }),

    defineRoute({
      method: 'get',
      path: `${PATH}/pdf`,
      summary: "One controlled drug's register for a period, as a PDF to print",
      tags: TAGS,
      permissions: POLICIES.sales.controlledRegister,
      request: { query: controlledRegisterQuerySchema },
      responses: { 200: { description: 'The register, application/pdf' } },
      handler: async ({ req, res, input }) => {
        const pharmacyId = await currentPharmacyId(prisma, config);
        const [data, pharmacy, printer] = await Promise.all([
          readOrFail(input.query),
          prisma.pharmacy.findUnique({ where: { pharmacyId }, select: { pharmacyNm: true } }),
          prisma.employee.findUnique({
            where: { employeeId: getAuth(res).employeeId },
            select: { firstNm: true, lastNm: true },
          }),
        ]);
        const dates = new Intl.DateTimeFormat(config.region.locale, {
          dateStyle: 'medium',
          timeZone: 'UTC',
        });
        const pdf = await renderRegister(data, {
          pharmacyName: pharmacy?.pharmacyNm?.trim() ?? '',
          printedBy: [printer?.firstNm, printer?.lastNm].filter(Boolean).join(' ').trim(),
          printedAt: new Intl.DateTimeFormat(LOCAL_STAMP, {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: config.region.timeZone,
          }).format(new Date()),
          formatDate: (date) => dates.format(new Date(`${date}T00:00:00Z`)),
        });
        await record(req, res, 'print', input.query);
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="controlled-register-${input.query.itemId}.pdf"`,
          'Cache-Control': 'no-store',
        });
        res.status(200).end(pdf);
      },
    }),
  ];
}
