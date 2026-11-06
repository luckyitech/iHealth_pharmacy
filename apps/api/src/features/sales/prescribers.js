import { POLICIES } from '@ihealth/shared/permissions';
import {
  dataResponseSchema,
  newDoctorBodySchema,
  prescriberQuerySchema,
  tillDoctorSchema,
  tillHospitalSchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { toDbTime } from '#db';

import { defineRoute } from '../../http/define-route.js';
import { validationFailed } from '../../lib/errors.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { getAuth } from '../auth/auth.guards.js';

const TAGS = ['Sales'];
const DOCTORS = '/sales/doctors';
const DOCTOR_RESOURCE = 'masters/providers';
/** Legacy flag of an active record. */
const ACTIVE = 'Y';

/**
 * @param {(string | null | undefined)[]} parts
 * @returns {string}
 */
const fullName = (parts) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
const textOrNull = (value) => value?.trim() || null;

/**
 * Doctors and hospitals for the till's prescription strip: finding them as a name is typed, and
 * adding a doctor who is not yet on the list. The full records are kept under Masters → Providers
 * and Masters → Hospitals.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The routes.
 */
export function createPrescriberRoutes({ prisma, audit, config }) {
  /**
   * @param {{ providerId: number, firstNm: string | null, middleNm: string | null, lastNm: string | null, licenseNumber: string | null, hospitalId: number | null }[]} rows
   * @returns {Promise<import('zod').infer<typeof tillDoctorSchema>[]>}
   */
  const toDoctors = async (rows) => {
    const hospitalIds = [...new Set(rows.map((row) => row.hospitalId).filter((id) => id !== null))];
    const hospitals = hospitalIds.length
      ? await prisma.hospital.findMany({
          where: { hospitalId: { in: /** @type {number[]} */ (hospitalIds) } },
          select: { hospitalId: true, name: true },
        })
      : [];
    const names = new Map(hospitals.map((row) => [row.hospitalId, textOrNull(row.name)]));
    return rows.map((row) => ({
      id: row.providerId,
      name: fullName([row.firstNm, row.middleNm, row.lastNm]),
      licenseNumber: textOrNull(row.licenseNumber),
      hospitalId: row.hospitalId,
      hospitalName: row.hospitalId === null ? null : (names.get(row.hospitalId) ?? null),
    }));
  };

  const doctorColumns = /** @type {const} */ ({
    providerId: true,
    firstNm: true,
    middleNm: true,
    lastNm: true,
    licenseNumber: true,
    hospitalId: true,
  });

  return [
    defineRoute({
      method: 'get',
      path: DOCTORS,
      summary: 'Find a doctor to put on a prescription',
      description:
        'Every word typed starts the first or last name, or the text starts the licence number. ' +
        'The placeholder for bills without a doctor is never listed.',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { query: prescriberQuerySchema },
      responses: {
        200: {
          description: 'Matching doctors',
          schema: dataResponseSchema(z.array(tillDoctorSchema)),
        },
      },
      handler: async ({ input }) => {
        const q = /** @type {string} */ (input.query.q);
        const words = q.split(/\s+/).filter(Boolean);
        const rows = await prisma.provider.findMany({
          where: {
            activeS: ACTIVE,
            ...(config.sales.defaultProviderId
              ? { NOT: { providerId: config.sales.defaultProviderId } }
              : {}),
            OR: [
              {
                AND: words.map((word) => ({
                  OR: [{ firstNm: { startsWith: word } }, { lastNm: { startsWith: word } }],
                })),
              },
              { licenseNumber: { startsWith: q } },
            ],
          },
          select: doctorColumns,
          orderBy: [{ firstNm: 'asc' }, { lastNm: 'asc' }],
          take: config.sales.lookupLimit,
        });
        return { data: await toDoctors(rows) };
      },
    }),

    defineRoute({
      method: 'post',
      path: DOCTORS,
      summary: 'Add a doctor from the till',
      description:
        'Only the name, licence, phone and hospital; the rest is kept under Masters → Providers.',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { body: newDoctorBodySchema },
      responses: {
        201: { description: 'The new doctor', schema: dataResponseSchema(tillDoctorSchema) },
      },
      handler: async ({ req, res, input }) => {
        const body = input.body;
        if (body.hospitalId) {
          const hospital = await prisma.hospital.findUnique({
            where: { hospitalId: body.hospitalId },
            select: { activeS: true },
          });
          if (hospital?.activeS !== ACTIVE)
            throw validationFailed([
              { path: 'body.hospitalId', message: 'Choose a hospital from the list' },
            ]);
        }
        const by = String(getAuth(res).employeeId);
        const stamp = toDbTime();
        const created = await prisma.provider.create({
          data: {
            firstNm: body.firstName,
            lastNm: body.lastName,
            licenseNumber: body.licenseNumber,
            phoneNbr: body.phone,
            hospitalId: body.hospitalId ?? null,
            activeS: ACTIVE,
            creationTs: stamp,
            creationUserId: by,
            lastUpdateTs: stamp,
            lastUpdateUserId: by,
          },
          select: doctorColumns,
        });
        await audit.record({
          action: `${DOCTOR_RESOURCE}.create`,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          resourceType: DOCTOR_RESOURCE,
          resourceId: created.providerId,
          ipAddress: req.ip,
        });
        const [doctor] = await toDoctors([created]);
        return { data: doctor };
      },
    }),

    defineRoute({
      method: 'get',
      path: '/sales/hospitals',
      summary: 'Find the hospital a prescription came from',
      tags: TAGS,
      permissions: POLICIES.sales.sell,
      request: { query: prescriberQuerySchema },
      responses: {
        200: {
          description: 'Matching hospitals',
          schema: dataResponseSchema(z.array(tillHospitalSchema)),
        },
      },
      handler: async ({ input }) => {
        const rows = await prisma.hospital.findMany({
          where: { activeS: ACTIVE, name: { contains: input.query.q } },
          select: { hospitalId: true, name: true },
          orderBy: { name: 'asc' },
          take: config.sales.lookupLimit,
        });
        return {
          data: rows.map((row) => ({ id: row.hospitalId, name: textOrNull(row.name) ?? '' })),
        };
      },
    }),
  ];
}
