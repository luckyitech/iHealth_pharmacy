import { POLICIES } from '@ihealth/shared/permissions';
import { GENDERS, MAX_PAGE_SIZE, providerInputSchema } from '@ihealth/shared/schemas';

import { AddressFields } from '@/components/form/address-fields';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { useProviderTypes } from '@/lib/lookups';
import { useResourceList } from '@/lib/resource-api';

import { formValuesFor, nameCell } from '../master-columns.jsx';
import { MasterResourcePage } from '../master-resource-page.jsx';

const GENDER_OPTIONS = Object.freeze([
  { value: GENDERS.FEMALE, label: 'Female' },
  { value: GENDERS.MALE, label: 'Male' },
]);

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>> }} props
 * @returns {React.JSX.Element}
 */
function ProviderFields({ form }) {
  const types = useProviderTypes();
  const hospitals = useResourceList('masters/hospitals', {
    page: 1,
    pageSize: MAX_PAGE_SIZE,
    sort: 'name',
    filters: { status: 'active' },
  });
  const hospitalRows = /** @type {{ id: number, name: string }[]} */ (
    /** @type {{ data?: unknown[] } | undefined} */ (hospitals.data)?.data ?? []
  );
  const hospitalOptions = hospitalRows.map((hospital) => ({
    value: hospital.id,
    label: hospital.name,
  }));
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField form={form} name="firstName" label="First name" required />
        <TextField form={form} name="middleName" label="Middle name" />
        <TextField form={form} name="lastName" label="Last name" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          form={form}
          name="licenseNumber"
          label="Licence number"
          hint="As issued by the licensing board."
        />
        <SelectField
          form={form}
          name="gender"
          label="Gender"
          options={GENDER_OPTIONS}
          emptyLabel="Not stated"
        />
        <SelectField
          form={form}
          name="providerTypeId"
          label="Type"
          emptyLabel="Choose a type"
          loading={types.isPending}
          options={(types.data ?? []).map((type) => ({ value: type.id, label: type.name }))}
        />
        <TextField form={form} name="speciality" label="Speciality" />
      </div>
      <SelectField
        form={form}
        name="hospitalId"
        label="Hospital"
        emptyLabel="No hospital"
        loading={hospitals.isPending}
        options={hospitalOptions}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="phone" label="Phone" type="tel" />
        <TextField form={form} name="email" label="Email" type="email" />
      </div>
      <AddressFields form={form} />
    </>
  );
}

/**
 * @param {{ firstName: string, middleName: string | null, lastName: string }} row
 * @returns {string}
 */
const fullName = (row) => [row.firstName, row.middleName, row.lastName].filter(Boolean).join(' ');

/** @type {import('../master-resource-page.jsx').MasterResourceConfig} */
const CONFIG = {
  resource: 'masters/providers',
  title: 'Providers',
  singular: 'provider',
  description: 'Doctors and other prescribers named on prescriptions.',
  columns: [
    nameCell('lastName', 'Name', fullName),
    {
      id: 'licenseNumber',
      header: 'Licence',
      sortable: true,
      cell: (row) => row.licenseNumber ?? '—',
    },
    { id: 'providerTypeName', header: 'Type', cell: (row) => row.providerTypeName ?? '—' },
    { id: 'hospitalName', header: 'Hospital', cell: (row) => row.hospitalName ?? '—' },
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ],
  defaultSort: 'lastName',
  searchPlaceholder: 'Search by name or licence number',
  schema: providerInputSchema,
  toFormValues: formValuesFor(providerInputSchema),
  Fields: ProviderFields,
  writePermissions: POLICIES.masters.write,
  recordName: (item) => fullName(item) || 'Unnamed provider',
};

/**
 * @returns {React.JSX.Element}
 */
export default function ProvidersPage() {
  return <MasterResourcePage config={CONFIG} />;
}
