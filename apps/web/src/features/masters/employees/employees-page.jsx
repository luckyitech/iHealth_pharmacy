import { POLICIES } from '@ihealth/shared/permissions';
import {
  EMPLOYEE_TITLES,
  employeeInputSchema,
  EMPLOYMENT_TYPES,
  GENDERS,
} from '@ihealth/shared/schemas';

import { AddressFields } from '@/components/form/address-fields';
import { FormSection } from '@/components/form/form-section';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { CheckboxField } from '@/components/ui/checkbox-field';
import { useEmployeeTypes } from '@/lib/lookups';

import { formValuesFor, nameCell } from '../master-columns.jsx';
import { MasterResourcePage } from '../master-resource-page.jsx';
import { EmployeeAccessPanel } from './employee-access-panel.jsx';

const TITLE_OPTIONS = Object.freeze(
  EMPLOYEE_TITLES.map((title) => ({ value: title, label: title })),
);

const GENDER_OPTIONS = Object.freeze([
  { value: GENDERS.FEMALE, label: 'Female' },
  { value: GENDERS.MALE, label: 'Male' },
]);

const EMPLOYMENT_OPTIONS = Object.freeze([
  { value: EMPLOYMENT_TYPES.FULL_TIME, label: 'Full time' },
  { value: EMPLOYMENT_TYPES.PART_TIME, label: 'Part time' },
]);

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>>, item: { employeeTypeName: string | null } | null }} props
 * @returns {React.JSX.Element}
 */
function EmployeeFields({ form, item }) {
  const types = useEmployeeTypes();
  return (
    <>
      <FormSection title="Personal">
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <SelectField
            form={form}
            name="title"
            label="Title"
            options={TITLE_OPTIONS}
            emptyLabel="Choose"
          />
          <TextField form={form} name="firstName" label="First name" autoComplete="given-name" />
          <TextField
            form={form}
            name="middleName"
            label="Middle name"
            autoComplete="additional-name"
          />
          <TextField form={form} name="lastName" label="Last name" autoComplete="family-name" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            form={form}
            name="gender"
            label="Gender"
            options={GENDER_OPTIONS}
            emptyLabel="Choose"
          />
          <TextField form={form} name="birthDate" label="Date of birth" type="date" />
          <TextField form={form} name="bloodGroup" label="Blood group" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField form={form} name="phone" label="Mobile phone" type="tel" />
          <TextField form={form} name="landline" label="Landline" type="tel" />
          <TextField form={form} name="email" label="Email" type="email" />
        </div>
      </FormSection>

      <FormSection title="Job">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            name="designation"
            label="Designation"
            hint="e.g. Pharmacist, Cashier"
          />
          <SelectField
            form={form}
            name="employeeTypeId"
            label="Employee type"
            emptyLabel="Choose a type"
            loading={types.isPending}
            options={(types.data ?? []).map((type) => ({ value: type.id, label: type.name }))}
            selectedLabel={item?.employeeTypeName}
          />
          <SelectField
            form={form}
            name="employment"
            label="Full or part time"
            options={EMPLOYMENT_OPTIONS}
            emptyLabel="Not stated"
          />
          <TextField form={form} name="joiningDate" label="Date of joining" type="date" />
        </div>
        <CheckboxField label="Works shifts" {...form.register('worksShifts')} />
      </FormSection>

      <FormSection title="Statutory numbers">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="nssfNumber" label="NSSF number" />
          <TextField form={form} name="nhifNumber" label="NHIF number" />
          <TextField form={form} name="kraPin" label="KRA PIN" />
          <TextField form={form} name="idNumber" label="ID number" />
        </div>
      </FormSection>

      <AddressFields form={form}>
        <TextField form={form} name="postBox" label="P.O. Box" />
      </AddressFields>
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
  resource: 'masters/employees',
  title: 'Employees',
  singular: 'employee',
  description: 'Staff records. Sign-in, role and permissions are set separately.',
  columns: [
    nameCell('firstName', 'Name', fullName),
    { id: 'code', header: 'Code', sortable: true, cell: (row) => row.code ?? '—' },
    { id: 'designation', header: 'Designation', cell: (row) => row.designation ?? '—' },
    { id: 'phone', header: 'Phone', cell: (row) => row.phone ?? '—' },
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ],
  defaultSort: 'firstName',
  searchPlaceholder: 'Search by name, code, phone or designation',
  schema: employeeInputSchema,
  toFormValues: formValuesFor(employeeInputSchema, { worksShifts: false }),
  Fields: EmployeeFields,
  dialogSize: 'large',
  sections: ['Personal', 'Job', 'Statutory numbers', 'Address'],
  recordCode: (item) => item.code,
  tabs: [
    {
      id: 'access',
      label: 'Sign-in and access',
      Component: EmployeeAccessPanel,
      permissions: POLICIES.employeeAccess.read,
    },
  ],
  writePermissions: POLICIES.masters.write,
  recordName: (item) => fullName(item) || 'Unnamed employee',
};

/**
 * @returns {React.JSX.Element}
 */
export default function EmployeesPage() {
  return <MasterResourcePage config={CONFIG} />;
}
