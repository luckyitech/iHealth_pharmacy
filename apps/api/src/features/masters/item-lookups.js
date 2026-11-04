/* eslint-disable jsdoc/reject-any-type -- rows come from the generic CRUD factory, typed by each lookup's columns */
import { POLICIES } from '@ihealth/shared/permissions';
import { ITEM_LOOKUPS, optionalIdSchema, PRODUCT_KINDS } from '@ihealth/shared/schemas';

import { createCrudRoutes } from '../../http/crud/create-crud-routes.js';
import { isActive, LEGACY_STAMPS, pickColumns, text } from './legacy-mapping.js';

/**
 * Legacy `MEDICAL_OR_NON_MEDICAL` values.
 *
 * @type {Readonly<Record<string, string>>}
 */
const LEGACY_KIND = Object.freeze({
  [PRODUCT_KINDS.MEDICAL]: 'M',
  [PRODUCT_KINDS.NON_MEDICAL]: 'N',
});

/**
 * @typedef {object} LookupDefinition
 * @property {string} resource
 * @property {string} label
 * @property {string} model Prisma delegate name.
 * @property {string} idField
 * @property {{ inputSchema: import('zod').ZodObject, itemSchema: import('zod').ZodType }} schemas
 * @property {Record<string, string>} columns API field -> Prisma field (`name` may write several columns).
 * @property {string[]} [nameColumns] Extra columns that hold the same name; written with it and read as a fallback.
 * @property {string[]} [nameFallbacks] Columns read when the name is empty (never written).
 */

/** @type {LookupDefinition[]} */
const LOOKUPS = [
  {
    resource: 'masters/item-categories',
    label: 'Item category',
    model: 'itemsCategories',
    idField: 'itemCategorieId',
    schemas: ITEM_LOOKUPS.categories,
    columns: {
      code: 'categorieCd',
      name: 'categorieNm',
      description: 'categorieDesc',
      productKind: 'medicalOrNonMedical',
      marginPercent: 'marginPercentage',
    },
    // The legacy "add category" form had no name field, so many categories only have a description.
    nameFallbacks: ['categorieDesc'],
  },
  {
    resource: 'masters/item-forms',
    label: 'Item form',
    model: 'itemsForms',
    idField: 'itemFormId',
    schemas: ITEM_LOOKUPS.forms,
    columns: { code: 'formCd', name: 'form', productKind: 'medicalOrNonMedical' },
  },
  {
    resource: 'masters/item-groups',
    label: 'Item group',
    model: 'itemsGroup',
    idField: 'itemGroupId',
    schemas: ITEM_LOOKUPS.groups,
    columns: {
      code: 'groupCd',
      name: 'groupName',
      description: 'groupDesc',
      productKind: 'medicalOrNonMedical',
    },
  },
  {
    resource: 'masters/generic-names',
    label: 'Generic name',
    model: 'itemsGenericNames',
    idField: 'itemGenericNameId',
    schemas: ITEM_LOOKUPS.genericNames,
    columns: {
      code: 'genericCd',
      name: 'genericName',
      productKind: 'medicalOrNonMedical',
      itemGroupId: 'itemGroupId',
    },
  },
  {
    resource: 'masters/specializations',
    label: 'Specialization',
    model: 'specialization',
    idField: 'specializationId',
    schemas: ITEM_LOOKUPS.specializations,
    columns: {
      code: 'specializationCd',
      name: 'specializationName',
      description: 'specializationDesc',
    },
  },
  {
    resource: 'masters/units-of-measure',
    label: 'Unit of measure',
    model: 'unitOfMeasurement',
    idField: 'unitOfMeasurementId',
    schemas: ITEM_LOOKUPS.unitsOfMeasure,
    // Legacy rows keep the unit's name in MEASUREMENT_DESC (MEASUREMENT_NAME is empty); both are written.
    columns: { code: 'measurementCd', name: 'measurementDesc' },
    nameColumns: ['measurementName'],
  },
];

/**
 * @param {LookupDefinition} definition
 * @returns {(row: Record<string, any>) => Record<string, unknown>}
 */
function itemMapper({ idField, columns, nameColumns = [], nameFallbacks = [] }) {
  return (row) => {
    /** @type {Record<string, unknown>} */
    const item = { id: row[idField], active: isActive(row.activeS) };
    for (const [field, column] of Object.entries(columns)) {
      const value = row[column];
      if (field === 'productKind')
        item.productKind = value === 'N' ? PRODUCT_KINDS.NON_MEDICAL : PRODUCT_KINDS.MEDICAL;
      else if (field === 'itemGroupId' || field === 'marginPercent') item[field] = value ?? null;
      else if (field === 'code' || field === 'name') {
        const fallbacks = field === 'name' ? [...nameColumns, ...nameFallbacks] : [];
        item[field] =
          text(value) ?? fallbacks.map((column) => text(row[column])).find(Boolean) ?? '';
      } else item[field] = text(value);
    }
    return item;
  };
}

/**
 * @param {LookupDefinition} definition
 * @returns {(input: Record<string, any>) => Record<string, unknown>}
 */
function dataMapper({ columns, nameColumns = [] }) {
  return (input) => {
    const data = pickColumns(
      { ...input, ...(input.productKind ? { productKind: LEGACY_KIND[input.productKind] } : {}) },
      columns,
    );
    if ('name' in input) for (const column of nameColumns) data[column] = input.name;
    return data;
  };
}

/**
 * Generic names show the name of their item group (there is no foreign key, so no Prisma relation).
 *
 * @param {Record<string, any>[]} items
 * @param {any} prisma
 * @returns {Promise<Record<string, any>[]>}
 */
async function withGroupNames(items, prisma) {
  const ids = [...new Set(items.map((item) => item.itemGroupId).filter(Boolean))];
  const groups = ids.length
    ? await prisma.itemsGroup.findMany({
        where: { itemGroupId: { in: ids } },
        select: { itemGroupId: true, groupName: true },
      })
    : [];
  const names = new Map(
    groups.map((/** @type {any} */ group) => [group.itemGroupId, text(group.groupName)]),
  );
  return items.map((item) => ({ ...item, itemGroupName: names.get(item.itemGroupId) ?? null }));
}

/**
 * Routes of the item-master lookups: categories, forms, groups, generic names, specializations, units.
 *
 * @param {{ prisma: import('#db').PrismaClient, audit: import('../audit/audit-log.js').AuditLog }} deps
 * @returns The routes of every lookup.
 */
export function createItemLookupRoutes(deps) {
  return LOOKUPS.flatMap((definition) => {
    const { columns } = definition;
    const nameColumn = columns.name;
    const searchColumns = [columns.code, nameColumn, ...(definition.nameColumns ?? [])];
    return createCrudRoutes(
      {
        resource: definition.resource,
        label: definition.label,
        tag: 'Masters',
        delegate: (prisma) => prisma[definition.model],
        idField: definition.idField,
        permissions: POLICIES.masters,
        itemSchema: definition.schemas.itemSchema,
        inputSchema: definition.schemas.inputSchema,
        select: Object.fromEntries(
          [
            definition.idField,
            'activeS',
            ...Object.values(columns),
            ...(definition.nameColumns ?? []),
          ].map((c) => [c, true]),
        ),
        toItem: itemMapper(definition),
        toData: dataMapper(definition),
        sortable: ['name', 'code'],
        sortColumns: { name: nameColumn, code: columns.code },
        defaultSort: 'name',
        search: (q) => ({ OR: searchColumns.map((column) => ({ [column]: { contains: q } })) }),
        ...(definition.columns.itemGroupId
          ? {
              filters: {
                shape: { itemGroupId: optionalIdSchema.optional() },
                toWhere: (query) => (query.itemGroupId ? { itemGroupId: query.itemGroupId } : {}),
              },
              enrich: withGroupNames,
            }
          : {}),
        activeField: 'activeS',
        unique: [
          {
            field: 'name',
            where: (input) => (input.name ? { [nameColumn]: input.name } : null),
            message: `A ${definition.label.toLowerCase()} with this name already exists`,
          },
        ],
        stamps: LEGACY_STAMPS,
      },
      deps,
    );
  });
}
