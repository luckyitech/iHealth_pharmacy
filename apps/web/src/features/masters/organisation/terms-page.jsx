import { POLICIES } from '@ihealth/shared/permissions';
import { termsInputSchema } from '@ihealth/shared/schemas';

import { FormField } from '@/components/form/form-field';
import { Textarea } from '@/components/ui/textarea';

import { formValuesFor } from '../master-columns.jsx';
import { MasterResourcePage } from '../master-resource-page.jsx';

const EXCERPT_LENGTH = 140;

/**
 * @param {{ form: import('react-hook-form').UseFormReturn<Record<string, unknown>> }} props
 * @returns {React.JSX.Element}
 */
function TermsFields({ form }) {
  const error = /** @type {{ message?: string } | undefined} */ (form.formState.errors.text)
    ?.message;
  return (
    <FormField
      form={form}
      name="text"
      label="Terms and conditions"
      error={error}
      hint="Printed on quotations, invoices and orders."
    >
      {(control) => <Textarea {...control} rows={14} {...form.register('text')} />}
    </FormField>
  );
}

/**
 * @param {string} text
 * @returns {string}
 */
const excerpt = (text) =>
  text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;

/** @type {import('../master-resource-page.jsx').MasterResourceConfig} */
const CONFIG = {
  resource: 'masters/terms',
  title: 'Terms and conditions',
  singular: 'terms text',
  description: 'Standard terms printed on your documents.',
  columns: [
    {
      id: 'text',
      header: 'Text',
      cell: (row) => <span className="line-clamp-2 max-w-2xl">{excerpt(row.text) || '—'}</span>,
    },
    { id: 'active', header: 'Status', cell: (row) => (row.active ? 'Active' : 'Inactive') },
  ],
  defaultSort: '-id',
  searchPlaceholder: 'Search the text',
  schema: termsInputSchema,
  toFormValues: formValuesFor(termsInputSchema),
  Fields: TermsFields,
  writePermissions: POLICIES.masters.write,
  recordName: (item) => excerpt(item.text).slice(0, 40) || 'Terms text',
};

/**
 * @returns {React.JSX.Element}
 */
export default function TermsPage() {
  return <MasterResourcePage config={CONFIG} />;
}
