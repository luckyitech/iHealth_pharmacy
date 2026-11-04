import { POLICIES } from '@ihealth/shared/permissions';
import { CUSTOMER_KINDS, customerInputSchema, GENDERS } from '@ihealth/shared/schemas';

import { AddressFields } from '@/components/form/address-fields';
import { FormSection } from '@/components/form/form-section';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';

import { formValuesFor, nameCell } from '../master-columns.jsx';
import { MasterResourcePage } from '../master-resource-page.jsx';
import { RecordEditorPage } from '../record-editor-page.jsx';

const KIND_OPTIONS = Object.freeze([
  { value: CUSTOMER_KINDS.INDIVIDUAL, label: 'Individual' },
  { value: CUSTOMER_KINDS.CORPORATE, label: 'Corporate (company account)' },
]);

const KIND_FILTER_OPTIONS = Object.freeze([
  { value: CUSTOMER_KINDS.INDIVIDUAL, label: 'Individuals' },
  { value: CUSTOMER_KINDS.CORPORATE, label: 'Corporate' },
]);

const GENDER_OPTIONS = Object.freeze([
  { value: GENDERS.FEMALE, label: 'Female' },
  { value: GENDERS.MALE, label: 'Male' },
]);

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>> }} props
 * @returns {React.JSX.Element}
 */
function CustomerFields({ form }) {
  const corporate = form.watch('kind') === CUSTOMER_KINDS.CORPORATE;
  return (
    <>
      <FormSection title="Customer">
        <SelectField form={form} name="kind" label="Type" options={KIND_OPTIONS} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="firstName" label="First name" autoComplete="given-name" />
          <TextField form={form} name="lastName" label="Last name" autoComplete="family-name" />
          <TextField form={form} name="phone" label="Phone" type="tel" autoComplete="tel" />
          <TextField form={form} name="email" label="Email" type="email" autoComplete="email" />
          <SelectField
            form={form}
            name="gender"
            label="Gender"
            options={GENDER_OPTIONS}
            emptyLabel="Not stated"
          />
          <TextField form={form} name="birthDate" label="Date of birth" type="date" />
        </div>
      </FormSection>

      {corporate && (
        <FormSection title="Company">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="organisation" label="Company name" />
            <TextField form={form} name="taxNumber" label="Tax PIN" />
            <TextField form={form} name="contactFirstName" label="Contact first name" />
            <TextField form={form} name="contactLastName" label="Contact last name" />
          </div>
        </FormSection>
      )}

      <AddressFields form={form} />
    </>
  );
}

/**
 * @param {{ firstName: string, lastName: string | null }} row
 * @returns {string}
 */
const fullName = (row) => [row.firstName, row.lastName].filter(Boolean).join(' ');

/** @type {import('../master-resource-page.jsx').MasterResourceConfig} */
const CONFIG = {
  resource: 'masters/customers',
  title: 'Customers',
  singular: 'customer',
  description: 'People and companies the pharmacy sells to. Most are added at the till.',
  columns: [
    nameCell('firstName', 'Name', fullName),
    { id: 'phone', header: 'Phone', sortable: true, cell: (row) => row.phone || '—' },
    {
      id: 'kind',
      header: 'Type',
      cell: (row) =>
        row.kind === CUSTOMER_KINDS.CORPORATE ? (row.organisation ?? 'Corporate') : 'Individual',
    },
    { id: 'city', header: 'City', cell: (row) => row.city ?? '—' },
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ],
  defaultSort: 'firstName',
  searchPlaceholder: 'Search by name, phone or company',
  listFilters: [
    { key: 'kind', label: 'Type', allLabel: 'All types', options: KIND_FILTER_OPTIONS },
  ],
  schema: customerInputSchema,
  toFormValues: formValuesFor(customerInputSchema, { kind: CUSTOMER_KINDS.INDIVIDUAL }),
  Fields: CustomerFields,
  editor: 'page',
  sections: ['Customer', 'Address'],
  writePermissions: POLICIES.masters.write,
  recordName: (item) => fullName(item) || 'Unnamed customer',
};

/**
 * @returns {React.JSX.Element}
 */
export default function CustomersPage() {
  return <MasterResourcePage config={CONFIG} />;
}

/**
 * The page to create or edit one customer.
 *
 * @returns {React.JSX.Element}
 */
export function EditorPage() {
  return <RecordEditorPage config={CONFIG} />;
}
