import { POLICIES } from '@ihealth/shared/permissions';
import { manufacturerInputSchema } from '@ihealth/shared/schemas';

import { AddressFields } from '@/components/form/address-fields';
import { TextField } from '@/components/form/text-field';

import { MasterResourcePage } from '../master-resource-page.jsx';

const FIELDS = Object.freeze([
  'name',
  'license',
  'phone',
  'email',
  'fax',
  'website',
  'contactFirstName',
  'contactLastName',
  'contactPhone',
  'contactEmail',
  'addressLine1',
  'addressLine2',
  'city',
  'zip',
  'countryId',
  'provinceId',
]);

/**
 * @param {Record<string, unknown> | null} item
 * @returns {Record<string, unknown>}
 */
const toFormValues = (item) =>
  Object.fromEntries(FIELDS.map((field) => [field, item?.[field] ?? '']));

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>> }} props
 * @returns {React.JSX.Element}
 */
function ManufacturerFields({ form }) {
  return (
    <>
      <TextField form={form} name="name" label="Name" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="license" label="Licence number" />
        <TextField form={form} name="phone" label="Phone" type="tel" autoComplete="tel" />
        <TextField form={form} name="email" label="Email" type="email" autoComplete="email" />
        <TextField form={form} name="fax" label="Fax" type="tel" />
      </div>
      <TextField form={form} name="website" label="Website" type="url" />
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-semibold">Contact person</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="contactFirstName" label="First name" />
          <TextField form={form} name="contactLastName" label="Last name" />
          <TextField form={form} name="contactPhone" label="Phone" type="tel" />
          <TextField form={form} name="contactEmail" label="Email" type="email" />
        </div>
      </fieldset>
      <AddressFields form={form} />
    </>
  );
}

/** @type {import('../master-resource-page.jsx').MasterResourceConfig} */
const CONFIG = {
  resource: 'masters/manufacturers',
  title: 'Manufacturers',
  singular: 'manufacturer',
  description: 'Companies that make the products you stock.',
  columns: [
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
    { id: 'license', header: 'Licence', cell: (row) => row.license ?? '—' },
    { id: 'phone', header: 'Phone', cell: (row) => row.phone ?? '—' },
    { id: 'city', header: 'City', sortable: true, cell: (row) => row.city ?? '—' },
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ],
  defaultSort: 'name',
  searchPlaceholder: 'Search by name, licence or city',
  schema: manufacturerInputSchema,
  toFormValues,
  Fields: ManufacturerFields,
  writePermissions: POLICIES.masters.write,
  recordName: (item) => item.name || 'Unnamed manufacturer',
};

/**
 * @returns {React.JSX.Element}
 */
export default function ManufacturersPage() {
  return <MasterResourcePage config={CONFIG} />;
}
