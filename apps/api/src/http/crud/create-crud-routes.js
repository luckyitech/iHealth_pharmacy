/* eslint-disable jsdoc/reject-any-type -- generic over every master model: record shapes come from each resource's Zod schema and Prisma delegate */
import { ERROR_CODES } from '@ihealth/shared/errors';
import {
  createListQuerySchema,
  dataResponseSchema,
  idParamsSchema,
  listResponseSchema,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { paginate, toOrderBy } from '../../db/list-query.js';
import { getAuth } from '../../features/auth/auth.guards.js';
import { AUDIT_OUTCOMES } from '../../features/audit/audit-log.js';
import { AppError, notFound } from '../../lib/errors.js';
import { defineRoute } from '../define-route.js';

/** Legacy `ACTIVE_S` flag values. */
const ACTIVE = 'Y';
const INACTIVE = 'N';

export const STATUS_FILTER = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive', ALL: 'all' });

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean} Equal ignoring case and surrounding spaces, as MySQL compares them.
 */
const sameText = (a, b) =>
  String(a ?? '')
    .trim()
    .toLowerCase() ===
  String(b ?? '')
    .trim()
    .toLowerCase();

/**
 * @typedef {object} UniqueRule
 * @property {string} field API field the rule is about (used for the error's `path`).
 * @property {(input: Record<string, any>) => Record<string, unknown> | null} where Prisma `where` that finds a clash, or null to skip.
 * @property {string} message Shown on the field, e.g. "A manufacturer with this name already exists".
 */

/**
 * @typedef {object} CrudConfig
 * @property {string} resource URL segment, e.g. `manufacturers`.
 * @property {string} label Singular, for docs and messages, e.g. `Manufacturer`.
 * @property {string} tag OpenAPI tag.
 * @property {(prisma: any) => any} delegate The Prisma model delegate, e.g. `(prisma) => prisma.manufacturer`.
 * @property {string} idField Prisma primary-key field, e.g. `manufacturerId`.
 * @property {{ read: ReadonlyArray<import('@ihealth/shared/permissions').PermissionDefinition>, write: ReadonlyArray<import('@ihealth/shared/permissions').PermissionDefinition> }} permissions
 * @property {import('zod').ZodType} itemSchema API shape of one record.
 * @property {import('zod').ZodObject} inputSchema Create body; the update body is its partial.
 * @property {Record<string, boolean>} select Prisma select for reads.
 * @property {(row: any) => Record<string, unknown>} toItem Database row -> API item.
 * @property {(input: Record<string, any>) => Record<string, unknown>} toData API input -> Prisma data (only keys present in input).
 * @property {readonly [string, ...string[]]} sortable API fields clients may sort by.
 * @property {Record<string, string>} sortColumns API sort field -> Prisma field.
 * @property {string} defaultSort e.g. `name` or `-createdAt`.
 * @property {(q: string) => Record<string, unknown>} [search] Prisma `where` for the `q` text filter.
 * @property {{ shape: import('zod').ZodRawShape, toWhere: (query: Record<string, any>) => Record<string, unknown> }} [filters]
 * @property {string} [activeField] Prisma field of the legacy `ACTIVE_S` flag; enables deactivate/restore and the status filter.
 * @property {UniqueRule[]} [unique]
 * @property {{ createdBy?: string, updatedBy?: string, updatedAt?: string }} [stamps] Legacy audit columns to fill.
 * @property {(items: Record<string, any>[], prisma: any) => Promise<Record<string, any>[]>} [enrich] Adds related data (e.g. names of linked records) to items, in one query for a whole page.
 */

/**
 * Builds the standard REST endpoints of a master-data resource:
 *
 *   GET    /<resource>              list: paging, sorting, search, filters, active/inactive/all
 *   GET    /<resource>/:id          one record
 *   POST   /<resource>              create (201)
 *   PATCH  /<resource>/:id          update the fields sent
 *   DELETE /<resource>/:id          deactivate (ACTIVE_S = 'N'); legacy rows are never deleted
 *   POST   /<resource>/:id/restore  reactivate
 *
 * Reads need the `read` permissions, writes the `write` ones; every write is audited with the
 * names of the fields it changed, and duplicate checks run inside the same transaction as the write.
 *
 * @param {CrudConfig} config
 * @param {{ prisma: import('@ihealth/db').PrismaClient, audit: import('../../features/audit/audit-log.js').AuditLog }} deps
 * @returns The route definitions.
 */
export function createCrudRoutes(config, { prisma, audit }) {
  const path = `/${config.resource}`;
  const tags = [config.tag];
  const idField = config.idField;
  const updateSchema = config.inputSchema.partial();

  const listQuerySchema = createListQuerySchema({
    sortable: config.sortable,
    defaultSort: /** @type {any} */ (config.defaultSort),
    filters: {
      ...(config.activeField
        ? { status: z.enum(Object.values(STATUS_FILTER)).default(STATUS_FILTER.ACTIVE) }
        : {}),
      ...(config.filters?.shape ?? {}),
    },
  });

  /**
   * @param {Record<string, any>} query
   * @returns {Record<string, unknown>}
   */
  function listWhere(query) {
    /** @type {Record<string, unknown>[]} */
    const and = [];
    if (config.activeField && query.status !== STATUS_FILTER.ALL) {
      and.push(
        query.status === STATUS_FILTER.INACTIVE
          ? { [config.activeField]: INACTIVE }
          : { OR: [{ [config.activeField]: ACTIVE }, { [config.activeField]: null }] },
      );
    }
    if (query.q && config.search) and.push(config.search(query.q));
    if (config.filters) and.push(config.filters.toWhere(query));
    return and.length ? { AND: and } : {};
  }

  /**
   * @param {any} client
   * @param {Record<string, any>} input
   * @param {number | undefined} excludeId
   * @param {Record<string, unknown>} [current] The stored record (API shape) when updating.
   * @returns {Promise<void>}
   */
  async function assertUnique(client, input, excludeId, current) {
    for (const rule of config.unique ?? []) {
      // Legacy data has duplicates; only a changed value is checked, so old records stay editable.
      if (current && sameText(current[rule.field], input[rule.field])) continue;
      const where = rule.where(input);
      if (!where) continue;
      const clash = await config.delegate(client).findFirst({
        where:
          excludeId === undefined ? where : { AND: [where, { NOT: { [idField]: excludeId } }] },
        select: { [idField]: true },
      });
      if (clash) {
        throw new AppError(ERROR_CODES.CONFLICT, {
          message: rule.message,
          details: [{ path: `body.${rule.field}`, message: rule.message }],
        });
      }
    }
  }

  /**
   * @param {import('express').Response} res
   * @param {boolean} creating
   * @returns {Record<string, unknown>}
   */
  function stampsFor(res, creating) {
    const by = String(getAuth(res).employeeId);
    const stamps = config.stamps ?? {};
    return {
      ...(creating && stamps.createdBy ? { [stamps.createdBy]: by } : {}),
      ...(stamps.updatedBy ? { [stamps.updatedBy]: by } : {}),
      // Required: these legacy columns default to a zero date, which strict SQL mode rejects.
      ...(stamps.updatedAt ? { [stamps.updatedAt]: new Date() } : {}),
    };
  }

  /**
   * @param {number} id
   * @returns {Promise<any>}
   */
  async function findOrFail(id) {
    const row = await config
      .delegate(prisma)
      .findUnique({ where: { [idField]: id }, select: config.select });
    if (!row) throw notFound(`${config.label} not found`);
    return row;
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
      action: `${config.resource}.${action}`,
      outcome: AUDIT_OUTCOMES.SUCCESS,
      resourceType: config.resource,
      resourceId: id,
      ipAddress: req.ip,
      details,
    });

  /**
   * @param {boolean} active
   * @returns {(context: import('../define-route.js').RouteContext) => Promise<unknown>}
   */
  const setActive =
    (active) =>
    async ({ req, res, input }) => {
      const id = input.params.id;
      await findOrFail(id);
      await config.delegate(prisma).update({
        where: { [idField]: id },
        data: {
          [/** @type {string} */ (config.activeField)]: active ? ACTIVE : INACTIVE,
          ...stampsFor(res, false),
        },
      });
      await record(req, active ? 'restore' : 'deactivate', id);
      return active ? { data: await toOneItem(await findOrFail(id)) } : undefined;
    };

  /**
   * @param {any[]} rows
   * @returns {Promise<Record<string, any>[]>}
   */
  const toItems = async (rows) => {
    const items = rows.map(config.toItem);
    return config.enrich ? config.enrich(items, prisma) : items;
  };

  /**
   * @param {any} row
   * @returns {Promise<Record<string, any>>}
   */
  const toOneItem = async (row) => (await toItems([row]))[0];

  const itemResponse = dataResponseSchema(config.itemSchema);
  const readPermissions = config.permissions.read;
  const writePermissions = config.permissions.write;

  const routes = [
    defineRoute({
      method: 'get',
      path,
      summary: `List ${config.resource}`,
      tags,
      permissions: readPermissions,
      request: { query: listQuerySchema },
      responses: {
        200: {
          description: `A page of ${config.resource}`,
          schema: listResponseSchema(config.itemSchema),
        },
      },
      handler: async ({ input }) => {
        const where = listWhere(input.query);
        const page = await paginate(input.query, {
          count: () => config.delegate(prisma).count({ where }),
          findMany: ({ skip, take }) =>
            config.delegate(prisma).findMany({
              where,
              select: config.select,
              orderBy: [toOrderBy(input.query.sort, config.sortColumns), { [idField]: 'asc' }],
              skip,
              take,
            }),
        });
        return { data: await toItems(page.data), meta: page.meta };
      },
    }),

    defineRoute({
      method: 'get',
      path: `${path}/:id`,
      summary: `Get one ${config.label.toLowerCase()}`,
      tags,
      permissions: readPermissions,
      request: { params: idParamsSchema },
      responses: { 200: { description: config.label, schema: itemResponse } },
      handler: async ({ input }) => ({ data: await toOneItem(await findOrFail(input.params.id)) }),
    }),

    defineRoute({
      method: 'post',
      path,
      summary: `Create a ${config.label.toLowerCase()}`,
      tags,
      permissions: writePermissions,
      request: { body: config.inputSchema },
      responses: { 201: { description: 'Created', schema: itemResponse } },
      handler: async ({ req, res, input }) => {
        const created = await prisma.$transaction(async (tx) => {
          await assertUnique(tx, input.body, undefined);
          return config.delegate(tx).create({
            data: {
              ...config.toData(input.body),
              ...(config.activeField ? { [config.activeField]: ACTIVE } : {}),
              ...stampsFor(res, true),
            },
            select: config.select,
          });
        });
        await record(req, 'create', created[idField], { fields: Object.keys(input.body) });
        return { data: await toOneItem(created) };
      },
    }),

    defineRoute({
      method: 'patch',
      path: `${path}/:id`,
      summary: `Update a ${config.label.toLowerCase()}`,
      description: 'Only the fields sent are changed.',
      tags,
      permissions: writePermissions,
      request: { params: idParamsSchema, body: updateSchema },
      responses: { 200: { description: 'Updated', schema: itemResponse } },
      handler: async ({ req, res, input }) => {
        const id = input.params.id;
        const current = config.toItem(await findOrFail(id));
        const updated = await prisma.$transaction(async (tx) => {
          await assertUnique(tx, input.body, id, current);
          return config.delegate(tx).update({
            where: { [idField]: id },
            data: { ...config.toData(input.body), ...stampsFor(res, false) },
            select: config.select,
          });
        });
        await record(req, 'update', id, { fields: Object.keys(input.body) });
        return { data: await toOneItem(updated) };
      },
    }),
  ];

  if (config.activeField) {
    routes.push(
      defineRoute({
        method: 'delete',
        path: `${path}/:id`,
        summary: `Deactivate a ${config.label.toLowerCase()}`,
        description:
          'Sets it inactive (legacy ACTIVE_S = N). Nothing is deleted, so history stays intact.',
        tags,
        permissions: writePermissions,
        request: { params: idParamsSchema },
        responses: { 204: { description: 'Deactivated' } },
        handler: setActive(false),
      }),
      defineRoute({
        method: 'post',
        path: `${path}/:id/restore`,
        summary: `Reactivate a ${config.label.toLowerCase()}`,
        tags,
        permissions: writePermissions,
        request: { params: idParamsSchema },
        responses: { 200: { description: 'Reactivated', schema: itemResponse } },
        handler: setActive(true),
      }),
    );
  }

  return routes;
}
