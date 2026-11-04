/* eslint-disable jsdoc/reject-any-type -- items come from the generic CRUD factory */
import { ERROR_CODES } from '@ihealth/shared/errors';
import { POLICIES } from '@ihealth/shared/permissions';
import {
  ITEM_SUPPLIER_ISSUES,
  itemSupplierInputSchema,
  itemSupplierSchema,
  SUPPLIER_PRIORITIES,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { AppError } from '../../lib/errors.js';
import { isActive, LEGACY_STAMPS, legacyDates, text, toLegacyDate } from './legacy-mapping.js';

/** At most this many items or suppliers are matched by one search. */
const MAX_SEARCH_MATCHES = 500;

/** Matches no row: Prisma treats `in: []` as false. */
const NOTHING = Object.freeze({ itemSupplierId: { in: [] } });

const SELECT = Object.freeze({
  itemSupplierId: true,
  activeS: true,
  itemId: true,
  supplierId: true,
  supplierPriority: true,
  unitRate: true,
  discountPercentage: true,
});

/**
 * @param {Record<string, any>} row
 * @returns {Record<string, unknown>}
 */
const toItem = (row) => ({
  id: row.itemSupplierId,
  active: isActive(row.activeS),
  itemId: row.itemId ?? null,
  supplierId: row.supplierId ?? null,
  priority: row.supplierPriority ?? null,
  unitRate: row.unitRate,
  discountPercent: row.discountPercentage,
});

/**
 * @param {Record<string, any>} input
 * @returns {Record<string, unknown>}
 */
function toData(input) {
  /** @type {Record<string, unknown>} */
  const data = {};
  if ('itemId' in input) data.itemId = input.itemId;
  if ('supplierId' in input) data.supplierId = input.supplierId;
  if ('priority' in input) data.supplierPriority = input.priority;
  if ('unitRate' in input) data.unitRate = input.unitRate;
  if ('discountPercent' in input) data.discountPercentage = input.discountPercent;
  if ('validUntil' in input) data.validity = toLegacyDate(input.validUntil);
  return data;
}

/**
 * Item-supplier pairs stored more than once.
 *
 * @param {any} prisma
 * @param {Record<string, unknown>} [where]
 * @returns {Promise<{ itemId: number | null, supplierId: number | null }[]>}
 */
async function duplicatePairs(prisma, where) {
  const groups = await prisma.itemsSupplier.groupBy({
    by: ['itemId', 'supplierId'],
    where,
    _count: { _all: true },
  });
  return groups
    .filter((/** @type {any} */ group) => group._count._all > 1)
    .map((/** @type {any} */ group) => ({ itemId: group.itemId, supplierId: group.supplierId }));
}

/**
 * Ids of links whose item or supplier no longer exists.
 *
 * @param {any} prisma
 * @returns {Promise<number[]>}
 */
async function linksWithMissingRecords(prisma) {
  /** @type {{ id: number }[]} */
  const rows = await prisma.$queryRaw`
    SELECT link.ITEM_SUPPLIER_ID AS id
    FROM items_supplier link
    LEFT JOIN items item ON item.ITEM_ID = link.ITEM_ID
    LEFT JOIN supplier supplier ON supplier.SUPPLIER_ID = link.SUPPLIER_ID
    WHERE item.ITEM_ID IS NULL OR supplier.SUPPLIER_ID IS NULL`;
  return rows.map((row) => Number(row.id));
}

const withValidity = legacyDates('items_supplier', 'ITEM_SUPPLIER_ID', { validUntil: 'VALIDITY' });

/**
 * Adds the item's and the supplier's names, the validity date, and flags for old data that needs
 * cleaning: the same pair stored twice, or a link to a record that no longer exists.
 *
 * @param {Record<string, any>[]} items
 * @param {any} prisma
 * @returns {Promise<Record<string, any>[]>}
 */
async function withDetails(items, prisma) {
  if (!items.length) return items;
  const ids = (/** @type {string} */ field) => [
    ...new Set(items.map((item) => item[field]).filter((id) => id !== null)),
  ];
  const [dated, products, suppliers, duplicates] = await Promise.all([
    withValidity(items, prisma),
    prisma.items.findMany({
      where: { itemId: { in: ids('itemId') } },
      select: { itemId: true, itemNm: true, itemCd: true },
    }),
    prisma.supplier.findMany({
      where: { supplierId: { in: ids('supplierId') } },
      select: { supplierId: true, spName: true },
    }),
    duplicatePairs(prisma, {
      OR: items.map((item) => ({ itemId: item.itemId, supplierId: item.supplierId })),
    }),
  ]);
  const productsById = new Map(products.map((/** @type {any} */ row) => [row.itemId, row]));
  const supplierNames = new Map(
    suppliers.map((/** @type {any} */ row) => [row.supplierId, text(row.spName)]),
  );
  const pairKey = (/** @type {any} */ pair) => `${pair.itemId}:${pair.supplierId}`;
  const duplicateKeys = new Set(duplicates.map(pairKey));
  return dated.map((item) => {
    const product = productsById.get(item.itemId);
    return {
      ...item,
      itemName: text(product?.itemNm),
      itemCode: text(product?.itemCd),
      supplierName: supplierNames.get(item.supplierId) ?? null,
      duplicate: duplicateKeys.has(pairKey(item)),
      itemMissing: !product,
      supplierMissing: !supplierNames.has(item.supplierId),
    };
  });
}

/**
 * Links whose item (name or code) or supplier (name) contains the search text.
 *
 * @param {string} q
 * @param {any} prisma
 * @returns {Promise<Record<string, unknown>>}
 */
async function searchByNames(q, prisma) {
  const [products, suppliers] = await Promise.all([
    prisma.items.findMany({
      where: { OR: [{ itemNm: { contains: q } }, { itemCd: { contains: q } }] },
      select: { itemId: true },
      take: MAX_SEARCH_MATCHES,
    }),
    prisma.supplier.findMany({
      where: { spName: { contains: q } },
      select: { supplierId: true },
      take: MAX_SEARCH_MATCHES,
    }),
  ]);
  return {
    OR: [
      { itemId: { in: products.map((/** @type {any} */ row) => row.itemId) } },
      { supplierId: { in: suppliers.map((/** @type {any} */ row) => row.supplierId) } },
    ],
  };
}

/**
 * @param {Record<string, any>} query
 * @param {any} prisma
 * @returns {Promise<Record<string, unknown>>}
 */
async function filterWhere(query, prisma) {
  /** @type {Record<string, unknown>[]} */
  const and = [];
  if (query.itemId) and.push({ itemId: query.itemId });
  if (query.supplierId) and.push({ supplierId: query.supplierId });
  if (query.priority) and.push({ supplierPriority: query.priority });
  if (query.issue === ITEM_SUPPLIER_ISSUES.DUPLICATE) {
    const pairs = await duplicatePairs(prisma);
    and.push(pairs.length ? { OR: pairs } : NOTHING);
  }
  if (query.issue === ITEM_SUPPLIER_ISSUES.MISSING_RECORD) {
    and.push({ itemSupplierId: { in: await linksWithMissingRecords(prisma) } });
  }
  return and.length ? { AND: and } : {};
}

/**
 * Refuses a link to an item or supplier that does not exist.
 *
 * @param {any} tx
 * @param {Record<string, any>} input
 * @returns {Promise<void>}
 */
async function assertLinkedRecordsExist(tx, input) {
  /** @type {{ path: string, message: string }[]} */
  const details = [];
  if ('itemId' in input) {
    const item = await tx.items.findUnique({
      where: { itemId: input.itemId },
      select: { itemId: true },
    });
    if (!item) details.push({ path: 'body.itemId', message: 'This item no longer exists' });
  }
  if ('supplierId' in input) {
    const supplier = await tx.supplier.findUnique({
      where: { supplierId: input.supplierId },
      select: { supplierId: true },
    });
    if (!supplier)
      details.push({ path: 'body.supplierId', message: 'This supplier no longer exists' });
  }
  if (details.length) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, { message: details[0].message, details });
  }
}

/**
 * Which suppliers an item is bought from, in priority order (1 first), with the rate per pack and
 * discount each one gives. Purchase orders and quotations use these as defaults.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog }} deps
 * @returns The item-supplier routes.
 */
export function createItemSupplierRoutes(deps) {
  return createCrudRoutes(
    {
      resource: 'masters/item-suppliers',
      label: 'Item supplier',
      tag: 'Masters',
      delegate: (client) => client.itemsSupplier,
      idField: 'itemSupplierId',
      permissions: POLICIES.masters,
      itemSchema: itemSupplierSchema,
      inputSchema: itemSupplierInputSchema,
      select: SELECT,
      toItem,
      toData,
      enrich: withDetails,
      sortable: ['priority', 'unitRate', 'discountPercent'],
      sortColumns: {
        priority: 'supplierPriority',
        unitRate: 'unitRate',
        discountPercent: 'discountPercentage',
      },
      defaultSort: 'priority',
      search: searchByNames,
      filters: {
        shape: {
          itemId: z.coerce.number().int().positive().optional(),
          supplierId: z.coerce.number().int().positive().optional(),
          priority: z.coerce
            .number()
            .int()
            .refine((value) => SUPPLIER_PRIORITIES.includes(value))
            .optional(),
          issue: z.enum(Object.values(ITEM_SUPPLIER_ISSUES)).optional(),
        },
        toWhere: filterWhere,
      },
      activeField: 'activeS',
      unique: [
        {
          field: 'supplierId',
          fields: ['itemId', 'supplierId'],
          where: (link) =>
            link.itemId && link.supplierId
              ? { itemId: link.itemId, supplierId: link.supplierId }
              : null,
          message: 'This supplier is already linked to this item',
        },
      ],
      beforeWrite: assertLinkedRecordsExist,
      stamps: LEGACY_STAMPS,
      createDefaults: async () => ({ creationTs: new Date() }),
    },
    deps,
  );
}
