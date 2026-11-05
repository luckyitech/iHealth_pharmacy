import { POLICIES } from '@ihealth/shared/permissions';
import { SUPPLIER_FLAGS, supplierInputSchema, SUPPLIES_KINDS } from '@ihealth/shared/schemas';

import { AddressFields } from '@/components/form/address-fields';
import { FormField } from '@/components/form/form-field';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { CheckboxField } from '@/components/ui/checkbox-field';
import { Textarea } from '@/components/ui/textarea';
import { usePaymentTypes, useReturnCreditTypes } from '@/lib/lookups';

import { formValuesFor, nameCell } from '../master-columns.jsx';
import { MasterResourcePage } from '../master-resource-page.jsx';

const SUPPLIES_OPTIONS = Object.freeze([
  { value: SUPPLIES_KINDS.BOTH, label: 'Medical and non-medical' },
  { value: SUPPLIES_KINDS.MEDICAL, label: 'Medical only' },
  { value: SUPPLIES_KINDS.NON_MEDICAL, label: 'Non-medical only' },
]);

/** Checkbox labels, by flag. */
const FLAG_LABELS = Object.freeze({
  alsoManufacturer: 'Also a manufacturer',
  allowOnlineOrders: 'Online orders',
  allowManualOrders: 'Manual orders',
  allowPhoneOrders: 'Phone orders',
  acceptExpiryReturns: 'Expired goods',
  acceptDamagedReturns: 'Damaged goods',
  acceptGoodReturns: 'Goods in good condition',
});

const ORDER_FLAGS = ['allowOnlineOrders', 'allowManualOrders', 'allowPhoneOrders'];
const RETURN_FLAGS = ['acceptExpiryReturns', 'acceptDamagedReturns', 'acceptGoodReturns'];

/** A new supplier, as the legacy form started it. */
const NEW_SUPPLIER = Object.freeze({
  supplies: SUPPLIES_KINDS.BOTH,
  ...Object.fromEntries(SUPPLIER_FLAGS.map((flag) => [flag, false])),
});

/**
 * @param {{ data?: { id: number, name: string }[] }} query
 * @returns {{ value: number, label: string }[]}
 */
const lookupOptions = (query) =>
  (query.data ?? []).map((option) => ({ value: option.id, label: option.name }));

/**
 * @param {{ title: string, description?: string, children: React.ReactNode }} props
 * @returns {React.JSX.Element}
 */
function Section({ title, description, children }) {
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-1 text-sm font-semibold text-muted-foreground">{title}</legend>
      {description && <p className="-mt-2 text-sm text-muted-foreground">{description}</p>}
      {children}
    </fieldset>
  );
}

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>>, flags: string[] }} props
 * @returns {React.JSX.Element}
 */
function Flags({ form, flags }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {flags.map((flag) => (
        <CheckboxField
          key={flag}
          label={FLAG_LABELS[/** @type {keyof typeof FLAG_LABELS} */ (flag)]}
          {...form.register(flag)}
        />
      ))}
    </div>
  );
}

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>>, item: { paymentTypeName: string | null, returnCreditTypeName: string | null } | null }} props
 * @returns {React.JSX.Element}
 */
function SupplierFields({ form, item }) {
  const paymentTypes = usePaymentTypes();
  const creditTypes = useReturnCreditTypes();
  return (
    <>
      <Section title="Supplier">
        <TextField form={form} name="name" label="Name" />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField form={form} name="taxPin" label="Tax PIN" hint="KRA PIN, e.g. P051234567X" />
          <TextField form={form} name="registrationNumber" label="SL number" />
          <SelectField form={form} name="supplies" label="Supplies" options={SUPPLIES_OPTIONS} />
        </div>
        <CheckboxField
          label={FLAG_LABELS.alsoManufacturer}
          {...form.register('alsoManufacturer')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="phone" label="Phone" type="tel" />
          <TextField form={form} name="email" label="Email" type="email" />
          <TextField form={form} name="fax" label="Fax" type="tel" />
          <TextField form={form} name="website" label="Website" />
        </div>
      </Section>

      <Section title="Contact person">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField form={form} name="contactFirstName" label="First name" />
          <TextField form={form} name="contactMiddleName" label="Middle name" />
          <TextField form={form} name="contactLastName" label="Last name" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="contactPhone" label="Phone" type="tel" />
          <TextField form={form} name="contactEmail" label="Email" type="email" />
        </div>
      </Section>

      <Section
        title="Order emails"
        description="Quotations and purchase orders are emailed to the contact email and to each of these."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField form={form} name="contactEmail2" label="Second email" type="email" />
          <TextField form={form} name="contactEmail3" label="Third email" type="email" />
          <TextField form={form} name="contactEmail4" label="Fourth email" type="email" />
        </div>
      </Section>

      <AddressFields form={form} />

      <Section title="Payment">
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            form={form}
            name="paymentTypeId"
            label="Payment type"
            emptyLabel="Not set"
            loading={paymentTypes.isPending}
            options={lookupOptions(paymentTypes)}
            selectedLabel={item?.paymentTypeName}
          />
          <TextField
            form={form}
            name="creditDays"
            label="Credit days"
            inputMode="numeric"
            hint="Days allowed to pay an invoice."
          />
          <TextField
            form={form}
            name="lateInterestPercent"
            label="Late payment interest (%)"
            inputMode="numeric"
          />
        </div>
        <FormField
          form={form}
          name="paymentTerms"
          label="Payment terms"
          error={form.formState.errors.paymentTerms?.message}
        >
          {(control) => <Textarea {...control} rows={2} {...form.register('paymentTerms')} />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="bankName" label="Bank" />
          <TextField form={form} name="accountNumber" label="Account number" inputMode="numeric" />
        </div>
      </Section>

      <Section title="Orders accepted">
        <Flags form={form} flags={ORDER_FLAGS} />
      </Section>

      <Section title="Returns">
        <SelectField
          form={form}
          name="returnCreditTypeId"
          label="Returns are credited as"
          emptyLabel="Choose"
          loading={creditTypes.isPending}
          options={lookupOptions(creditTypes)}
          selectedLabel={item?.returnCreditTypeName}
        />
        <Flags form={form} flags={RETURN_FLAGS} />
      </Section>
    </>
  );
}

/**
 * @param {{ contactFirstName: string | null, contactLastName: string | null }} row
 * @returns {string}
 */
const contactName = (row) =>
  [row.contactFirstName, row.contactLastName].filter(Boolean).join(' ') || '—';

/** @type {import('../master-resource-page.jsx').MasterResourceConfig} */
const CONFIG = {
  resource: 'masters/suppliers',
  title: 'Suppliers',
  singular: 'supplier',
  description: 'The distributors the pharmacy buys stock from.',
  columns: [
    nameCell('name', 'Name'),
    { id: 'taxPin', header: 'Tax PIN', cell: (row) => row.taxPin ?? '—' },
    { id: 'phone', header: 'Phone', cell: (row) => row.phone ?? '—' },
    { id: 'contact', header: 'Contact', cell: contactName },
    {
      id: 'creditDays',
      header: 'Credit days',
      sortable: true,
      cell: (row) => row.creditDays ?? '—',
    },
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ],
  defaultSort: 'name',
  searchPlaceholder: 'Search by name, tax PIN, phone or contact',
  listFilters: [
    {
      key: 'supplies',
      label: 'Supplies',
      allLabel: 'Supplies anything',
      options: SUPPLIES_OPTIONS,
    },
  ],
  schema: supplierInputSchema,
  toFormValues: formValuesFor(supplierInputSchema, NEW_SUPPLIER),
  Fields: SupplierFields,
  wideForm: true,
  writePermissions: POLICIES.suppliers.write,
  recordName: (item) => item.name || 'Unnamed supplier',
};

/**
 * @returns {React.JSX.Element}
 */
export default function SuppliersPage() {
  return <MasterResourcePage config={CONFIG} />;
}
