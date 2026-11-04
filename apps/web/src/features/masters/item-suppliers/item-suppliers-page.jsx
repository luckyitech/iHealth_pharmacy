/* eslint-disable jsdoc/reject-any-type -- rows come from the item-supplier API schema */
import { POLICIES } from '@ihealth/shared/permissions';
import {
  ITEM_SUPPLIER_ISSUES,
  itemSupplierInputSchema,
  SUPPLIER_PRIORITIES,
} from '@ihealth/shared/schemas';
import { TriangleAlert, X } from 'lucide-react';

import { ComboboxField } from '@/components/form/combobox-field';
import { FormSection } from '@/components/form/form-section';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useResource } from '@/lib/resource-api';

import { formValuesFor } from '../master-columns.jsx';
import { MasterResourcePage } from '../master-resource-page.jsx';
import { linkProblems } from './link-problems.js';

const ITEMS = 'masters/items';
const SUPPLIERS = 'masters/suppliers';

const PRIORITY_OPTIONS = Object.freeze(
  SUPPLIER_PRIORITIES.map((priority) => ({
    value: priority,
    label: priority === 1 ? '1 (bought from first)' : String(priority),
  })),
);

const ISSUE_OPTIONS = Object.freeze([
  { value: ITEM_SUPPLIER_ISSUES.DUPLICATE, label: 'Linked twice' },
  { value: ITEM_SUPPLIER_ISSUES.MISSING_RECORD, label: 'Item or supplier gone' },
]);

/** Decimal places shown for a rate. */
const RATE_DECIMALS = 2;

/**
 * @returns {string} Today in the browser's time zone, as `YYYY-MM-DD`.
 */
function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const baseValues = formValuesFor(itemSupplierInputSchema);

/**
 * @param {any | null} link
 * @returns {Record<string, unknown>}
 */
const toFormValues = (link) => ({
  ...baseValues(link),
  // The legacy column cannot be empty; a new link is valid from today unless changed.
  validUntil: link?.validUntil ?? today(),
});

/**
 * @param {string | undefined} value
 * @returns {number | undefined}
 */
const idFrom = (value) => (value && Number(value) > 0 ? Number(value) : undefined);

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>>, item: any | null }} props
 * @returns {React.JSX.Element}
 */
function ItemSupplierFields({ form, item }) {
  // A new link opened from an item or a supplier starts with it chosen: show its name.
  const defaults = /** @type {Record<string, unknown>} */ (form.formState.defaultValues ?? {});
  const presetItem = useResource(ITEMS, item ? undefined : idFrom(String(defaults.itemId ?? '')));
  const presetSupplier = useResource(
    SUPPLIERS,
    item ? undefined : idFrom(String(defaults.supplierId ?? '')),
  );
  const problems = item ? linkProblems(item) : [];

  return (
    <>
      {problems.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Old data to check</AlertTitle>
          <AlertDescription>
            {problems.map((problem) => problem.description).join(' ')}
          </AlertDescription>
        </Alert>
      )}
      <FormSection title="Link">
        <ComboboxField
          form={form}
          name="itemId"
          label="Item"
          resource={ITEMS}
          selectedLabel={item?.itemName ?? /** @type {any} */ (presetItem.data)?.name ?? null}
          optionLabel={(row) => (row.code ? `${row.name} (${row.code})` : row.name)}
          placeholder="Search items by name or code…"
        />
        <ComboboxField
          form={form}
          name="supplierId"
          label="Supplier"
          resource={SUPPLIERS}
          selectedLabel={
            item?.supplierName ?? /** @type {any} */ (presetSupplier.data)?.name ?? null
          }
          placeholder="Search suppliers…"
        />
      </FormSection>
      <FormSection title="Terms">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            form={form}
            name="priority"
            label="Priority"
            emptyLabel="Choose a priority"
            options={PRIORITY_OPTIONS}
            hint="1 is the supplier to buy from first."
          />
          <TextField form={form} name="validUntil" label="Valid until" type="date" />
          <TextField
            form={form}
            name="unitRate"
            label="Rate per pack"
            inputMode="decimal"
            hint="What this supplier charges for one purchase unit."
          />
          <TextField form={form} name="discountPercent" label="Discount (%)" inputMode="decimal" />
        </div>
      </FormSection>
    </>
  );
}

/**
 * When the list shows one item's suppliers or one supplier's items, says so, with a way back to all.
 *
 * @param {{ filters: Record<string, string>, setFilters: (filters: Record<string, string | undefined>) => void }} props
 * @returns {React.JSX.Element | null}
 */
function ScopeBar({ filters, setFilters }) {
  const itemId = idFrom(filters.itemId);
  const supplierId = idFrom(filters.supplierId);
  const product = useResource(ITEMS, itemId);
  const supplier = useResource(SUPPLIERS, supplierId);
  if (!itemId && !supplierId) return null;
  const scope = [
    itemId && `item ${/** @type {any} */ (product.data)?.name ?? `#${itemId}`}`,
    supplierId && `supplier ${/** @type {any} */ (supplier.data)?.name ?? `#${supplierId}`}`,
  ]
    .filter(Boolean)
    .join(' and ');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
      <span>
        Showing the links of <span className="font-medium">{scope}</span>.
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={() => setFilters({ itemId: undefined, supplierId: undefined })}
      >
        <X aria-hidden="true" />
        Show all links
      </Button>
    </div>
  );
}

/**
 * @param {any} row
 * @returns {React.ReactNode}
 */
function ItemCell(row) {
  const problems = linkProblems(row);
  return (
    <span className="grid gap-0.5">
      <span className="font-medium">
        {row.itemName ?? <span className="text-muted-foreground italic">Item gone</span>}
      </span>
      {row.itemCode && <span className="text-xs text-muted-foreground">{row.itemCode}</span>}
      {problems.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {problems.map((problem) => (
            <span
              key={problem.id}
              className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-2 py-0.5 text-xs text-destructive"
            >
              <TriangleAlert aria-hidden="true" className="size-3" />
              {problem.label}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** @type {import('../master-resource-page.jsx').MasterResourceConfig} */
const CONFIG = {
  resource: 'masters/item-suppliers',
  title: 'Item suppliers',
  singular: 'item supplier',
  description: 'Which suppliers each item is bought from, in order, with their rate and discount.',
  columns: [
    { id: 'itemName', header: 'Item', cell: ItemCell },
    {
      id: 'supplierName',
      header: 'Supplier',
      cell: (row) =>
        row.supplierName ?? <span className="text-muted-foreground italic">Supplier gone</span>,
    },
    { id: 'priority', header: 'Priority', sortable: true, cell: (row) => row.priority ?? '—' },
    {
      id: 'unitRate',
      header: 'Rate per pack',
      sortable: true,
      className: 'text-right tabular-nums',
      cell: (row) => row.unitRate.toFixed(RATE_DECIMALS),
    },
    {
      id: 'discountPercent',
      header: 'Discount',
      sortable: true,
      className: 'text-right tabular-nums',
      cell: (row) => `${row.discountPercent}%`,
    },
    { id: 'validUntil', header: 'Valid until', cell: (row) => row.validUntil ?? '—' },
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ],
  defaultSort: 'priority',
  searchPlaceholder: 'Search by item name, item code or supplier',
  listFilters: [
    {
      key: 'priority',
      label: 'Priority',
      allLabel: 'Any priority',
      options: PRIORITY_OPTIONS.map((option) => ({ ...option, value: String(option.value) })),
    },
    { key: 'issue', label: 'Old data', allLabel: 'Any data', options: ISSUE_OPTIONS },
  ],
  ListContext: ScopeBar,
  schema: itemSupplierInputSchema,
  toFormValues,
  newRecordDefaults: (filters) => ({
    ...(idFrom(filters.itemId) ? { itemId: idFrom(filters.itemId) } : {}),
    ...(idFrom(filters.supplierId) ? { supplierId: idFrom(filters.supplierId) } : {}),
  }),
  Fields: ItemSupplierFields,
  dialogSize: 'large',
  sections: ['Link', 'Terms'],
  writePermissions: POLICIES.masters.write,
  recordName: (link) =>
    `${link.itemName ?? 'Item gone'} from ${link.supplierName ?? 'supplier gone'}`,
};

/**
 * @returns {React.JSX.Element}
 */
export default function ItemSuppliersPage() {
  return <MasterResourcePage config={CONFIG} />;
}
