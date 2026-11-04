import { POLICIES } from '@ihealth/shared/permissions';
import { hospitalInputSchema } from '@ihealth/shared/schemas';

import { AddressFields } from '@/components/form/address-fields';
import { FormSection } from '@/components/form/form-section';
import { TextField } from '@/components/form/text-field';

import { formValuesFor, nameCell } from '../master-columns.jsx';
import { MasterResourcePage } from '../master-resource-page.jsx';
import { RecordEditorPage } from '../record-editor-page.jsx';

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>> }} props
 * @returns {React.JSX.Element}
 */
function HospitalFields({ form }) {
  return (
    <>
      <FormSection title="Hospital">
        <TextField form={form} name="name" label="Name" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="license" label="Licence number" />
          <TextField form={form} name="phone" label="Phone" type="tel" />
          <TextField form={form} name="contactNumber" label="Other contact number" type="tel" />
          <TextField form={form} name="helpline" label="Helpline" type="tel" />
          <TextField form={form} name="email" label="Email" type="email" />
          <TextField form={form} name="fax" label="Fax" type="tel" />
        </div>
        <TextField form={form} name="website" label="Website" type="url" />
      </FormSection>
      <AddressFields form={form} />
    </>
  );
}

/** @type {import('../master-resource-page.jsx').MasterResourceConfig} */
const CONFIG = {
  resource: 'masters/hospitals',
  title: 'Hospitals',
  singular: 'hospital',
  description: 'Hospitals and clinics your prescribers work at.',
  columns: [
    nameCell('name', 'Name'),
    { id: 'phone', header: 'Phone', cell: (row) => row.phone ?? '—' },
    { id: 'city', header: 'City', sortable: true, cell: (row) => row.city ?? '—' },
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ],
  defaultSort: 'name',
  searchPlaceholder: 'Search by name, licence or city',
  schema: hospitalInputSchema,
  toFormValues: formValuesFor(hospitalInputSchema),
  Fields: HospitalFields,
  editor: 'page',
  sections: ['Hospital', 'Address'],
  recordCode: (item) => item.license,
  writePermissions: POLICIES.masters.write,
  recordName: (item) => item.name || 'Unnamed hospital',
};

/**
 * @returns {React.JSX.Element}
 */
export default function HospitalsPage() {
  return <MasterResourcePage config={CONFIG} />;
}

/**
 * The page to create or edit one hospital.
 *
 * @returns {React.JSX.Element}
 */
export function EditorPage() {
  return <RecordEditorPage config={CONFIG} />;
}
