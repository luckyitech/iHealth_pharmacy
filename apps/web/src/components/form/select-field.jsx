/* eslint-disable jsdoc/reject-any-type -- works with any form; field names come from each master's schema */
import { NativeSelect } from '@/components/ui/native-select';

import { FormField } from './form-field.jsx';

/**
 * A labelled select bound to a React Hook Form field. The empty option maps to `null` in the schema.
 *
 * @param {object} props
 * @param {import('react-hook-form').UseFormReturn<any>} props.form
 * @param {string} props.name
 * @param {string} props.label
 * @param {readonly { value: string | number, label: string }[]} props.options
 * @param {string} [props.emptyLabel] Shown for "nothing chosen"; omit to force a choice.
 * @param {boolean} [props.required]
 * @param {boolean} [props.loading]
 * @param {React.ReactNode} [props.hint]
 * @returns {React.JSX.Element}
 */
export function SelectField({
  form,
  name,
  label,
  options,
  emptyLabel,
  required,
  loading = false,
  hint,
}) {
  const error = /** @type {{ message?: string } | undefined} */ (form.formState.errors[name])
    ?.message;
  return (
    <FormField label={label} required={required} error={error} hint={hint}>
      {(control) => (
        <NativeSelect {...control} {...form.register(name)} disabled={loading}>
          {emptyLabel !== undefined && (
            <option value="">{loading ? 'Loading…' : emptyLabel}</option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      )}
    </FormField>
  );
}
