/* eslint-disable jsdoc/reject-any-type -- the pharmacy row is typed by SELECT */
import { BYTES_PER_KB } from '@ihealth/shared/units';
import { ERROR_CODES } from '@ihealth/shared/errors';
import { POLICIES } from '@ihealth/shared/permissions';
import {
  dataResponseSchema,
  LOGO_TYPES,
  MAX_LOGO_BYTES,
  pharmacyProfileInputSchema,
  pharmacyProfileSchema,
} from '@ihealth/shared/schemas';
import express from 'express';

import { defineRoute } from '../../http/define-route.js';
import { AppError, notFound } from '../../lib/errors.js';
import { getAuth } from '../auth/auth.guards.js';
import { AUDIT_OUTCOMES } from '../audit/audit-log.js';
import { currentPharmacyWhere } from './current-pharmacy.js';
import { ADDRESS_COLUMNS, pickColumns, text } from './legacy-mapping.js';

const RESOURCE = 'masters/pharmacy-profile';
const FLAG_YES = 'Y';
const FLAG_NO = 'N';

/** API field -> `pharmacy` column (Prisma field), for text and id fields. */
const COLUMNS = Object.freeze({
  name: 'pharmacyNm',
  taxId: 'taxId',
  phone: 'phoneNbr',
  email: 'emailId',
  contactFirstName: 'authorizedPersonFirstNm',
  contactMiddleName: 'authorizedPersonMiddleNm',
  contactLastName: 'authorizedPersonLastNm',
  contactEmail: 'authorizedPersonEmailId',
  contactPhone: 'authorizedPersonPhoneNbr',
  website: 'websiteUrl',
  fax: 'faxNbr',
  bccEmail: 'bccEmailId',
  ...ADDRESS_COLUMNS,
});

/** API flag -> `pharmacy` Y/N column. */
const FLAGS = Object.freeze({
  openAllHours: 'hours',
  purchaseOrderApproval: 'purchaseOrderApproval',
});
const REQUIRED_TEXT = new Set(['name', 'taxId', 'phone', 'email', 'contactFirstName']);

const SELECT = Object.freeze(
  Object.fromEntries(
    ['pharmacyId', ...Object.values(COLUMNS), ...Object.values(FLAGS)].map((column) => [
      column,
      true,
    ]),
  ),
);

/** Image signatures, so the stored bytes really are the declared type. */
const SIGNATURES = Object.freeze({
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
});

/**
 * @param {Buffer} bytes
 * @returns {string | null} The image type the bytes start with.
 */
function detectImageType(bytes) {
  for (const [type, signature] of Object.entries(SIGNATURES)) {
    if (signature.every((byte, index) => bytes[index] === byte)) return type;
  }
  return null;
}

/**
 * @param {Record<string, any>} row
 * @param {boolean} hasLogo
 * @returns {import('zod').infer<typeof pharmacyProfileSchema>}
 */
function toProfile(row, hasLogo) {
  /** @type {Record<string, unknown>} */
  const profile = { id: row.pharmacyId, hasLogo };
  for (const [field, column] of Object.entries(COLUMNS)) {
    profile[field] = field.endsWith('Id')
      ? (row[column] ?? null)
      : REQUIRED_TEXT.has(field)
        ? (text(row[column]) ?? '')
        : text(row[column]);
  }
  for (const [field, column] of Object.entries(FLAGS)) profile[field] = row[column] === FLAG_YES;
  return /** @type {any} */ (profile);
}

/**
 * The pharmacy's own profile (name, tax PIN, contacts, address, logo): the record set by
 * PHARMACY_ID, or the first active pharmacy. It feeds the sign-in page, receipts and documents.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The pharmacy profile routes.
 */
export function createPharmacyProfileRoutes({ prisma, audit, config }) {
  const where = currentPharmacyWhere(config);

  /** @returns {Promise<{ row: Record<string, any>, hasLogo: boolean }>} */
  async function load() {
    const row = await prisma.pharmacy.findFirst({
      where,
      orderBy: { pharmacyId: 'asc' },
      select: SELECT,
    });
    if (!row) throw notFound('No pharmacy record found');
    /** @type {{ hasLogo: bigint | number }[]} */
    const [logo] = await prisma.$queryRaw`
      SELECT PHARMACY_LOGO_PATH IS NOT NULL AND LENGTH(PHARMACY_LOGO_PATH) > 0 AS hasLogo
      FROM pharmacy WHERE PHARMACY_ID = ${row.pharmacyId}`;
    return { row, hasLogo: Boolean(Number(logo?.hasLogo)) };
  }

  /**
   * @param {import('express').Request} req
   * @param {string} action
   * @param {number} id
   * @param {Record<string, unknown>} [details]
   * @returns {Promise<void>}
   */
  const record = (req, action, id, details) =>
    audit.record({
      action: `${RESOURCE}.${action}`,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      resourceType: RESOURCE,
      resourceId: id,
      ipAddress: req.ip,
      details,
    });

  const profileResponse = dataResponseSchema(pharmacyProfileSchema);

  return [
    defineRoute({
      method: 'get',
      path: `/${RESOURCE}`,
      summary: "The pharmacy's profile",
      tags: ['Masters'],
      permissions: POLICIES.masters.read,
      responses: { 200: { description: 'Pharmacy profile', schema: profileResponse } },
      handler: async () => {
        const { row, hasLogo } = await load();
        return { data: toProfile(row, hasLogo) };
      },
    }),

    defineRoute({
      method: 'patch',
      path: `/${RESOURCE}`,
      summary: "Update the pharmacy's profile",
      description: 'Only the fields sent are changed.',
      tags: ['Masters'],
      permissions: POLICIES.masters.write,
      request: { body: pharmacyProfileInputSchema.partial() },
      responses: { 200: { description: 'Updated', schema: profileResponse } },
      handler: async ({ req, res, input }) => {
        const { row } = await load();
        /** @type {Record<string, unknown>} */
        const data = pickColumns(input.body, COLUMNS);
        for (const [field, column] of Object.entries(FLAGS)) {
          if (field in input.body) data[column] = input.body[field] ? FLAG_YES : FLAG_NO;
        }
        await prisma.pharmacy.update({
          where: { pharmacyId: row.pharmacyId },
          data: {
            ...data,
            lastUpdateUserId: String(getAuth(res).employeeId),
            lastUpdateTs: new Date(),
          },
        });
        await record(req, 'update', row.pharmacyId, { fields: Object.keys(input.body) });
        const updated = await load();
        return { data: toProfile(updated.row, updated.hasLogo) };
      },
    }),

    defineRoute({
      method: 'get',
      path: `/${RESOURCE}/logo`,
      summary: "The pharmacy's logo image",
      description: 'Public, so the sign-in page and printed documents can show it.',
      tags: ['Masters'],
      access: 'public',
      responses: { 200: { description: 'The image' }, 404: { description: 'No logo' } },
      handler: async ({ res }) => {
        const { row } = await load();
        /** @type {{ logo: Uint8Array | null }[]} */
        const [stored] =
          await prisma.$queryRaw`SELECT PHARMACY_LOGO_PATH AS logo FROM pharmacy WHERE PHARMACY_ID = ${row.pharmacyId}`;
        const bytes = stored?.logo ? Buffer.from(stored.logo) : null;
        const type = bytes ? detectImageType(bytes) : null;
        if (!bytes || !type) throw notFound('No logo');
        res.set({
          'Content-Type': type,
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        });
        res.status(200).end(bytes);
      },
    }),

    defineRoute({
      method: 'put',
      path: `/${RESOURCE}/logo`,
      summary: "Replace the pharmacy's logo",
      description: `Send the image itself as the body (${LOGO_TYPES.join(', ')}), at most ${MAX_LOGO_BYTES / BYTES_PER_KB} kB.`,
      tags: ['Masters'],
      permissions: POLICIES.masters.write,
      before: [express.raw({ type: [...LOGO_TYPES], limit: MAX_LOGO_BYTES })],
      responses: { 204: { description: 'Saved' } },
      handler: async ({ req, res }) => {
        const bytes = Buffer.isBuffer(req.body) ? req.body : null;
        const declared = req.get('content-type')?.split(';')[0].trim() ?? '';
        if (
          !bytes?.length ||
          !LOGO_TYPES.includes(declared) ||
          detectImageType(bytes) !== declared
        ) {
          throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
            message: `Upload a PNG, JPEG or WebP image of at most ${MAX_LOGO_BYTES / BYTES_PER_KB} kB.`,
          });
        }
        const { row } = await load();
        await prisma.pharmacy.update({
          where: { pharmacyId: row.pharmacyId },
          data: {
            pharmacyLogoPath: new Uint8Array(bytes),
            lastUpdateUserId: String(getAuth(res).employeeId),
            lastUpdateTs: new Date(),
          },
        });
        await record(req, 'logo', row.pharmacyId, { bytes: bytes.length, type: declared });
      },
    }),
  ];
}
