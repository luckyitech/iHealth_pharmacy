import { POLICIES } from '@ihealth/shared/permissions';
import { GENDERS, providerInputSchema } from '@ihealth/shared/schemas';

import { AddressFields } from '@/components/form/address-fields';
import { FormSection } from '@/components/form/form-section';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { useProviderTypes } from '@/lib/lookups';
import { useResourceOptions } from '@/lib/resource-api';

import { formValuesFor, nameCell } from '../master-columns.jsx';
import { MasterResourcePage } from '../master-resource-page.jsx';

const GENDER_OPTIONS = Object.freeze([
  { value: GENDERS.FEMALE, label: 'Female' },
  { value: GENDERS.MALE, label: 'Male' },
]);

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>>, item: { hospitalName: string | null, providerTypeName: string | null } | null }} props
 * @returns {React.JSX.Element}
 */
function ProviderFields({ form, item }) {
  const types = useProviderTypes();
  const hospitals = useResourceOptions('masters/hospitals');
  return (
    <>
      <FormSection title="Provider">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField form={form} name="firstName" label="First name" />
          <TextField form={form} name="middleName" label="Middle name" />
          <TextField form={form} name="lastName" label="Last name" />
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
            selectedLabel={item?.providerTypeName}
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
          selectedLabel={item?.hospitalName}
          label="Hospital"
          emptyLabel="No hospital"
          loading={hospitals.isPending}
          options={hospitals.options}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="phone" label="Phone" type="tel" />
          <TextField form={form} name="email" label="Email" type="email" />
        </div>
      </FormSection>
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
  dialogSize: 'large',
  sections: ['Provider', 'Address'],
  recordCode: (item) => item.licenseNumber,
  writePermissions: POLICIES.masters.write,
  recordName: (item) => fullName(item) || 'Unnamed provider',
};

/**
 * @returns {React.JSX.Element}
 */
export default function ProvidersPage() {
  return <MasterResourcePage config={CONFIG} />;
}
