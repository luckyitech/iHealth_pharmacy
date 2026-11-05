import { POLICIES } from '@ihealth/shared/permissions';
import { itemInputSchema, PRODUCT_KINDS } from '@ihealth/shared/schemas';

import { ComboboxField } from '@/components/form/combobox-field';
import { FormField } from '@/components/form/form-field';
import { FormSection } from '@/components/form/form-section';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { Textarea } from '@/components/ui/textarea';
import { useLatinCodes, useScheduleCodes, useTaxCategories } from '@/lib/lookups';
import { useResourceOptions } from '@/lib/resource-api';

import { formValuesFor, nameCell } from '../master-columns.jsx';
import { ITEM_SUPPLIERS_TAB } from '../item-suppliers/link-tabs.js';
import { MasterResourcePage } from '../master-resource-page.jsx';

const KIND_OPTIONS = Object.freeze([
  { value: PRODUCT_KINDS.MEDICAL, label: 'Medical' },
  { value: PRODUCT_KINDS.NON_MEDICAL, label: 'Non-medical' },
]);

/**
 * @param {import('@tanstack/react-query').UseQueryResult<{ id: number, name: string }[]>} query
 * @returns {{ value: number, label: string }[]}
 */
const lookupOptions = (query) =>
  (query.data ?? []).map((option) => ({ value: option.id, label: option.name }));

/**
 * Names of the record's current choices, from the API.
 *
 * @typedef {Record<'genericName' | 'formName' | 'manufacturerName' | 'groupName' | 'categoryName' | 'specializationName' | 'purchaseUnitName' | 'issueUnitName' | 'taxCategoryName', string | null>} StoredNames
 */

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>>, item: StoredNames | null }} props
 * @returns {React.JSX.Element}
 */
function ItemFields({ form, item }) {
  const groups = useResourceOptions('masters/item-groups');
  const categories = useResourceOptions('masters/item-categories');
  const specializations = useResourceOptions('masters/specializations');
  const units = useResourceOptions('masters/units-of-measure');
  const taxes = useTaxCategories();
  const schedules = useScheduleCodes();
  const latinCodes = useLatinCodes();

  return (
    <>
      <FormSection title="Product">
        <TextField form={form} name="name" label="Name" />
        <FormField
          form={form}
          name="description"
          label="Description"
          error={form.formState.errors.description?.message}
        >
          {(control) => <Textarea {...control} rows={2} {...form.register('description')} />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            form={form}
            name="code"
            label="Item code"
            hint={item ? undefined : 'Leave empty to generate one.'}
          />
          <TextField form={form} name="barcode" label="Barcode" inputMode="numeric" />
          <SelectField form={form} name="productKind" label="Kind" options={KIND_OPTIONS} />
        </div>
      </FormSection>

      <FormSection title="Classification">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            form={form}
            name="groupId"
            selectedLabel={item?.groupName}
            label="Group"
            emptyLabel="Choose a group"
            loading={groups.isPending}
            options={groups.options}
          />
          <SelectField
            form={form}
            name="categoryId"
            selectedLabel={item?.categoryName}
            label="Category"
            emptyLabel="No category"
            loading={categories.isPending}
            options={categories.options}
          />
          <ComboboxField
            form={form}
            name="genericNameId"
            label="Generic name"
            resource="masters/generic-names"
            selectedLabel={item?.genericName}
            placeholder="Search generic names…"
          />
          <ComboboxField
            form={form}
            name="formId"
            label="Dosage form"
            resource="masters/item-forms"
            selectedLabel={item?.formName}
            placeholder="Search dosage forms…"
          />
          <ComboboxField
            form={form}
            name="manufacturerId"
            label="Manufacturer"
            resource="masters/manufacturers"
            selectedLabel={item?.manufacturerName}
            placeholder="Search manufacturers…"
          />
          <SelectField
            form={form}
            name="specializationId"
            selectedLabel={item?.specializationName}
            label="Specialization"
            emptyLabel="None"
            loading={specializations.isPending}
            options={specializations.options}
          />
        </div>
      </FormSection>

      <FormSection title="Units and tax">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            form={form}
            name="purchaseUnitId"
            selectedLabel={item?.purchaseUnitName}
            label="Purchase unit"
            emptyLabel="Choose a unit"
            loading={units.isPending}
            options={units.options}
          />
          <SelectField
            form={form}
            name="issueUnitId"
            selectedLabel={item?.issueUnitName}
            label="Issue unit"
            emptyLabel="Choose a unit"
            loading={units.isPending}
            options={units.options}
            hint="The unit it is sold or dispensed in."
          />
          <TextField
            form={form}
            name="pack"
            label="Pack size"
            hint="Issue units in one purchase unit."
          />
          <SelectField
            form={form}
            name="taxCategoryId"
            selectedLabel={item?.taxCategoryName}
            label="Tax category"
            emptyLabel="Choose a tax category"
            loading={taxes.isPending}
            options={lookupOptions(taxes)}
          />
        </div>
      </FormSection>

      <FormSection title="Clinical">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField form={form} name="strength" label="Strength" hint="e.g. 500 mg" />
          <TextField form={form} name="specification" label="Specification" />
          <TextField form={form} name="temperature" label="Storage temperature" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            form={form}
            name="scheduleCodeId"
            label="Schedule"
            emptyLabel="Not scheduled"
            loading={schedules.isPending}
            options={lookupOptions(schedules)}
          />
          <SelectField
            form={form}
            name="latinCodeId"
            label="Default directions"
            emptyLabel="None"
            loading={latinCodes.isPending}
            options={lookupOptions(latinCodes)}
          />
        </div>
        <FormField
          form={form}
          name="usage"
          label="Usage"
          error={form.formState.errors.usage?.message}
        >
          {(control) => <Textarea {...control} rows={2} {...form.register('usage')} />}
        </FormField>
      </FormSection>

      <FormSection title="Re-ordering">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            name="reorderLevel"
            label="Re-order level"
            inputMode="numeric"
            hint="Re-order when stock falls to this."
          />
          <TextField
            form={form}
            name="reorderQuantity"
            label="Re-order quantity"
            inputMode="numeric"
          />
        </div>
      </FormSection>
    </>
  );
}

/** @type {import('../master-resource-page.jsx').MasterResourceConfig} */
const CONFIG = {
  resource: 'masters/items',
  title: 'Items',
  singular: 'item',
  description: 'Every product the pharmacy buys and sells.',
  columns: [
    nameCell('name', 'Name'),
    { id: 'code', header: 'Code', sortable: true, cell: (row) => row.code ?? '—' },
    { id: 'groupName', header: 'Group', cell: (row) => row.groupName ?? '—' },
    { id: 'manufacturerName', header: 'Manufacturer', cell: (row) => row.manufacturerName ?? '—' },
    { id: 'taxCategoryName', header: 'Tax', cell: (row) => row.taxCategoryName ?? '—' },
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ],
  defaultSort: 'name',
  searchPlaceholder: 'Search by name, code, description or barcode',
  listFilters: [
    { key: 'productKind', label: 'Kind', allLabel: 'All kinds', options: KIND_OPTIONS },
  ],
  schema: itemInputSchema,
  toFormValues: formValuesFor(itemInputSchema, { productKind: PRODUCT_KINDS.MEDICAL }),
  Fields: ItemFields,
  dialogSize: 'large',
  sections: ['Product', 'Classification', 'Units and tax', 'Clinical', 'Re-ordering'],
  recordCode: (item) => item.code,
  writePermissions: POLICIES.masters.write,
  recordName: (item) => item.name || 'Unnamed item',
  tabs: [ITEM_SUPPLIERS_TAB],
};

/**
 * @returns {React.JSX.Element}
 */
export default function ItemsPage() {
  return <MasterResourcePage config={CONFIG} />;
}
