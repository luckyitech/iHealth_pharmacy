/* eslint-disable jsdoc/reject-any-type -- one page definition for six lookups with different optional fields */
/* eslint-disable react-refresh/only-export-components -- a configuration factory, not a component module; Fast Refresh reloads it fully */
import { POLICIES } from '@ihealth/shared/permissions';
import { MAX_PAGE_SIZE, PRODUCT_KINDS } from '@ihealth/shared/schemas';

import { FormField } from '@/components/form/form-field';
import { TextField } from '@/components/form/text-field';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useResourceList } from '@/lib/resource-api';

export const PRODUCT_KIND_LABELS = Object.freeze({
  [PRODUCT_KINDS.MEDICAL]: 'Medical',
  [PRODUCT_KINDS.NON_MEDICAL]: 'Non-medical',
});

/**
 * @typedef {object} LookupPageOptions
 * @property {string} resource
 * @property {string} title
 * @property {string} singular
 * @property {string} description
 * @property {{ inputSchema: import('zod').ZodObject }} schemas From ITEM_LOOKUPS in the shared package.
 */

/**
 * @param {string} resource
 * @returns {{ id: number, name: string }[]}
 */
function useActiveOptions(resource) {
  const list = useResourceList(resource, {
    page: 1,
    pageSize: MAX_PAGE_SIZE,
    sort: 'name',
    filters: { status: 'active' },
  });
  return /** @type {any} */ (list.data)?.data ?? [];
}

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<any> }} props
 * @returns {React.JSX.Element}
 */
function ItemGroupField({ form }) {
  const groups = useActiveOptions('masters/item-groups');
  return (
    <FormField
      form={form}
      name="itemGroupId"
      label="Item group"
      error={/** @type {any} */ (form.formState.errors.itemGroupId)?.message}
    >
      {(control) => (
        <NativeSelect {...control} {...form.register('itemGroupId')}>
          <option value="">No group</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </NativeSelect>
      )}
    </FormField>
  );
}

/**
 * Builds the page of one of the item-master lookups. Fields shown follow the lookup's schema.
 *
 * @param {LookupPageOptions} options
 * @returns {import('../master-resource-page.jsx').MasterResourceConfig}
 */
export function lookupPageConfig({ resource, title, singular, description, schemas }) {
  const shape = schemas.inputSchema.shape;
  const fields = Object.keys(shape);

  /**
   * @param {{ form: import('react-hook-form').UseFormReturn<any> }} props
   * @returns {React.JSX.Element}
   */
  function Fields({ form }) {
    const errors = /** @type {Record<string, { message?: string }>} */ (form.formState.errors);
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <TextField form={form} name="code" label="Code" />
          <TextField form={form} name="name" label="Name" />
        </div>
        {'productKind' in shape && (
          <FormField
            form={form}
            name="productKind"
            label="Type"
            error={errors.productKind?.message}
          >
            {(control) => (
              <NativeSelect {...control} {...form.register('productKind')}>
                {Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        )}
        {'itemGroupId' in shape && <ItemGroupField form={form} />}
        {'marginPercent' in shape && (
          <TextField
            form={form}
            name="marginPercent"
            label="Default margin (%)"
            inputMode="numeric"
            hint="Used for sale prices of items in this category. Prices are recalculated in the Stock module."
          />
        )}
        {'description' in shape && (
          <FormField
            form={form}
            name="description"
            label="Description"
            error={errors.description?.message}
          >
            {(control) => <Textarea {...control} rows={3} {...form.register('description')} />}
          </FormField>
        )}
      </>
    );
  }

  /** @type {import('@/components/data-table/data-table').DataTableColumn[]} */
  const columns = [
    {
      id: 'code',
      header: 'Code',
      sortable: true,
      cell: (row) => <span className="font-mono text-xs">{row.code || '—'}</span>,
    },
    {
      id: 'name',
      header: 'Name',
      sortable: true,
      cell: (row) =>
        row.name ? (
          <span className="font-medium">{row.name}</span>
        ) : (
          <span className="text-muted-foreground italic">Unnamed</span>
        ),
    },
    ...('itemGroupId' in shape
      ? [
          {
            id: 'itemGroupName',
            header: 'Group',
            cell: (/** @type {any} */ row) => row.itemGroupName ?? '—',
          },
        ]
      : []),
    ...('productKind' in shape
      ? [
          {
            id: 'productKind',
            header: 'Type',
            cell: (/** @type {any} */ row) =>
              PRODUCT_KIND_LABELS[
                /** @type {keyof typeof PRODUCT_KIND_LABELS} */ (row.productKind)
              ],
          },
        ]
      : []),
    ...('marginPercent' in shape
      ? [
          {
            id: 'marginPercent',
            header: 'Margin',
            className: 'text-right tabular-nums',
            cell: (/** @type {any} */ row) =>
              row.marginPercent === null ? '—' : `${row.marginPercent}%`,
          },
        ]
      : []),
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ];

  return {
    resource,
    title,
    singular,
    description,
    columns,
    defaultSort: 'name',
    searchPlaceholder: 'Search by code or name',
    schema: schemas.inputSchema,
    toFormValues: (item) =>
      Object.fromEntries(
        fields.map((field) => [
          field,
          field === 'productKind'
            ? (item?.productKind ?? PRODUCT_KINDS.MEDICAL)
            : (item?.[field] ?? ''),
        ]),
      ),
    Fields,
    writePermissions: POLICIES.masters.write,
    recordName: (item) => item.name || `Unnamed ${singular}`,
  };
}
