/* eslint-disable jsdoc/reject-any-type -- items come from the generic CRUD factory */
import { ERROR_CODES } from '@ihealth/shared/errors';
import { POLICIES } from '@ihealth/shared/permissions';
import {
  generatedItemCode,
  itemInputSchema,
  itemSchema,
  optionalIdSchema,
  PRODUCT_KINDS,
} from '@ihealth/shared/schemas';
import { z } from 'zod';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { AppError } from '../../lib/errors.js';
import { currentPharmacyId } from './current-pharmacy.js';
import { columnMapping, LEGACY_STAMPS, text } from './legacy-mapping.js';

/**
 * Legacy `MEDICAL_OR_NON_MEDICAL` values.
 *
 * @type {Readonly<Record<string, string>>}
 */
const LEGACY_KIND = Object.freeze({
  [PRODUCT_KINDS.MEDICAL]: 'M',
  [PRODUCT_KINDS.NON_MEDICAL]: 'N',
});

/** API field -> `items` column (Prisma field), for text and id fields. */
const COLUMNS = Object.freeze({
  code: 'itemCd',
  name: 'itemNm',
  description: 'itemDesc',
  groupId: 'itemGroupId',
  genericNameId: 'itemGenericNameId',
  formId: 'itemFormId',
  categoryId: 'itemCategorieId',
  specializationId: 'specializationId',
  manufacturerId: 'manufacturerId',
  purchaseUnitId: 'purchaseUnitOfMeasurementId',
  issueUnitId: 'issueUnitOfMeasurementId',
  pack: 'pack',
  taxCategoryId: 'taxId',
  barcode: 'barcode',
  strength: 'drugDose',
  specification: 'specification',
  temperature: 'temperature',
  usage: 'itemUsage',
  scheduleCodeId: 'scheduleCategoryCodeId',
  latinCodeId: 'latinShortCodeId',
});

/** Whole-number columns (not ids). */
const QUANTITIES = Object.freeze({ reorderLevel: 'reorderLevel', reorderQuantity: 'reorderQty' });

const MAPPING = columnMapping('itemId', COLUMNS, ['name']);

/** @type {Record<string, boolean>} */
const SELECT = {
  ...MAPPING.select,
  medicalOrNonMedical: true,
  ...Object.fromEntries(Object.values(QUANTITIES).map((column) => [column, true])),
};

/**
 * @param {Record<string, any>} row
 * @returns {Record<string, unknown>}
 */
function toItem(row) {
  return {
    ...MAPPING.toItem(row),
    productKind:
      row.medicalOrNonMedical?.toUpperCase() === LEGACY_KIND[PRODUCT_KINDS.NON_MEDICAL]
        ? PRODUCT_KINDS.NON_MEDICAL
        : PRODUCT_KINDS.MEDICAL,
    ...Object.fromEntries(
      Object.entries(QUANTITIES).map(([field, column]) => [field, row[column] ?? null]),
    ),
  };
}

/**
 * @param {Record<string, any>} input
 * @returns {Record<string, unknown>}
 */
function toData(input) {
  /** @type {Record<string, unknown>} */
  const data = MAPPING.toData(input);
  if (input.productKind) data.medicalOrNonMedical = LEGACY_KIND[input.productKind];
  for (const [field, column] of Object.entries(QUANTITIES))
    if (field in input) data[column] = input[field];
  return data;
}

/**
 * @typedef {object} NameSource
 * @property {string} field API id field on the item, e.g. `groupId`.
 * @property {string} nameField API field that receives the name, e.g. `groupName`.
 * @property {string} model Prisma delegate.
 * @property {string} idColumn
 * @property {(row: any) => string | null} name
 */

/** @type {NameSource[]} */
const NAME_SOURCES = [
  {
    field: 'groupId',
    nameField: 'groupName',
    model: 'itemsGroup',
    idColumn: 'itemGroupId',
    name: (row) => text(row.groupName),
  },
  {
    field: 'genericNameId',
    nameField: 'genericName',
    model: 'itemsGenericNames',
    idColumn: 'itemGenericNameId',
    name: (row) => text(row.genericName),
  },
  {
    field: 'formId',
    nameField: 'formName',
    model: 'itemsForms',
    idColumn: 'itemFormId',
    name: (row) => text(row.form),
  },
  {
    field: 'categoryId',
    nameField: 'categoryName',
    model: 'itemsCategories',
    idColumn: 'itemCategorieId',
    // As on the categories screen: many legacy categories only have a description.
    name: (row) => text(row.categorieNm) ?? text(row.categorieDesc),
  },
  {
    field: 'specializationId',
    nameField: 'specializationName',
    model: 'specialization',
    idColumn: 'specializationId',
    name: (row) => text(row.specializationName),
  },
  {
    field: 'manufacturerId',
    nameField: 'manufacturerName',
    model: 'manufacturer',
    idColumn: 'manufacturerId',
    name: (row) => text(row.mfrName),
  },
  {
    field: 'purchaseUnitId',
    nameField: 'purchaseUnitName',
    model: 'unitOfMeasurement',
    idColumn: 'unitOfMeasurementId',
    name: (row) => text(row.measurementDesc) ?? text(row.measurementName),
  },
  {
    field: 'issueUnitId',
    nameField: 'issueUnitName',
    model: 'unitOfMeasurement',
    idColumn: 'unitOfMeasurementId',
    name: (row) => text(row.measurementDesc) ?? text(row.measurementName),
  },
  {
    field: 'taxCategoryId',
    nameField: 'taxCategoryName',
    model: 'taxcategory',
    idColumn: 'taxcategoryId',
    name: (row) => taxCategoryLabel(row),
  },
];

/** Columns read for each name source (never legacy timestamps). */
const NAME_COLUMNS = Object.freeze({
  itemsGroup: ['groupName'],
  itemsGenericNames: ['genericName'],
  itemsForms: ['form'],
  itemsCategories: ['categorieNm', 'categorieDesc'],
  specialization: ['specializationName'],
  manufacturer: ['mfrName'],
  unitOfMeasurement: ['measurementDesc', 'measurementName'],
  taxcategory: ['categoryCode', 'categoryValue'],
});

/**
 * How a tax category is shown, e.g. "A (16%)".
 *
 * @param {{ categoryCode: string | null, categoryValue: number | null }} row
 * @returns {string | null}
 */
export function taxCategoryLabel(row) {
  const code = text(row.categoryCode);
  if (!code) return null;
  return row.categoryValue === null ? code : `${code} (${row.categoryValue}%)`;
}

/**
 * Adds the names of each item's group, form, manufacturer, units, tax category, ... in one query
 * per lookup table for the whole page (the legacy schema has no foreign keys, so no relations).
 *
 * @param {Record<string, any>[]} items
 * @param {any} prisma
 * @returns {Promise<Record<string, any>[]>}
 */
async function withNames(items, prisma) {
  /** @type {Map<string, NameSource[]>} */
  const byModel = new Map();
  for (const source of NAME_SOURCES)
    byModel.set(source.model, [...(byModel.get(source.model) ?? []), source]);

  /** @type {Map<string, Map<number, string | null>>} */
  const names = new Map();
  await Promise.all(
    [...byModel].map(async ([model, sources]) => {
      const ids = [
        ...new Set(sources.flatMap((source) => items.map((item) => item[source.field]))),
      ].filter(Boolean);
      const idColumn = sources[0].idColumn;
      const rows = ids.length
        ? await prisma[model].findMany({
            where: { [idColumn]: { in: ids } },
            select: Object.fromEntries(
              [idColumn, ...NAME_COLUMNS[/** @type {keyof typeof NAME_COLUMNS} */ (model)]].map(
                (column) => [column, true],
              ),
            ),
          })
        : [];
      names.set(
        model,
        new Map(rows.map((/** @type {any} */ row) => [row[idColumn], sources[0].name(row)])),
      );
    }),
  );

  return items.map((item) => ({
    ...item,
    ...Object.fromEntries(
      NAME_SOURCES.map((source) => [
        source.nameField,
        names.get(source.model)?.get(item[source.field]) ?? null,
      ]),
    ),
  }));
}

/**
 * Items with stock on hand cannot be deactivated (as in the legacy app): they could no longer be
 * sold or adjusted.
 *
 * @param {any} client
 * @param {number} id
 * @returns {Promise<void>}
 */
async function assertNoStock(client, id) {
  const withStock = await client.stock.count({ where: { itemId: id, quantity: { not: 0 } } });
  if (withStock > 0) {
    throw new AppError(ERROR_CODES.CONFLICT, {
      message: 'This item still has stock. Clear or adjust its stock before deactivating it.',
    });
  }
}

/**
 * The item master: every product the pharmacy buys and sells.
 *
 * Rack, shelf and prices are not edited here: they belong to stock (one item, many batches).
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog, config: Readonly<import('../../config/env.js').Config> }} deps
 * @returns The item routes.
 */
export function createItemRoutes({ prisma, audit, config }) {
  return createCrudRoutes(
    {
      resource: 'masters/items',
      label: 'Item',
      tag: 'Masters',
      delegate: (client) => client.items,
      idField: 'itemId',
      permissions: POLICIES.masters,
      itemSchema,
      inputSchema: itemInputSchema,
      select: SELECT,
      toItem,
      toData,
      enrich: withNames,
      sortable: ['name', 'code'],
      sortColumns: { name: 'itemNm', code: 'itemCd' },
      defaultSort: 'name',
      search: (q) => ({
        OR: [
          { itemNm: { contains: q } },
          { itemCd: { contains: q } },
          { itemDesc: { contains: q } },
          { barcode: { contains: q } },
        ],
      }),
      filters: {
        shape: {
          productKind: z.enum([PRODUCT_KINDS.MEDICAL, PRODUCT_KINDS.NON_MEDICAL]).optional(),
          groupId: optionalIdSchema.optional(),
        },
        toWhere: (query) => ({
          ...(query.productKind ? { medicalOrNonMedical: LEGACY_KIND[query.productKind] } : {}),
          ...(query.groupId ? { itemGroupId: query.groupId } : {}),
        }),
      },
      activeField: 'activeS',
      unique: [
        {
          field: 'code',
          where: (input) => (input.code ? { itemCd: input.code } : null),
          message: 'An item with this code already exists',
        },
        {
          field: 'barcode',
          where: (input) => (input.barcode ? { barcode: input.barcode } : null),
          message: 'An item with this barcode already exists',
        },
      ],
      stamps: LEGACY_STAMPS,
      createDefaults: async (tx) => ({ pharmacyId: await currentPharmacyId(tx, config) }),
      afterCreate: (tx, row) =>
        row.itemCd?.trim()
          ? row
          : tx.items.update({
              where: { itemId: row.itemId },
              data: { itemCd: generatedItemCode(row.itemId) },
              select: SELECT,
            }),
      beforeDeactivate: assertNoStock,
    },
    { prisma, audit },
  );
}
