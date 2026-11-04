/* eslint-disable jsdoc/reject-any-type -- works with any form; field names come from each master's schema */
import { useController } from 'react-hook-form';

import { NativeSelect } from '@/components/ui/native-select';

import { FormField } from './form-field.jsx';

/**
 * A labelled select bound to a React Hook Form field. The empty option maps to `null` in the schema.
 * It is controlled, so a stored value still shows when the options load after the form is filled.
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
 * @param {(value: string) => void} [props.onValueChange] Runs after the value changes (e.g. to clear a dependent field).
 * @param {boolean} [props.disabled]
 * @param {string | null} [props.selectedLabel] Name of the stored choice, shown even when it is no longer offered (e.g. inactive).
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
  selectedLabel,
  onValueChange,
  disabled = false,
}) {
  const { field, fieldState } = useController({ name, control: form.control });
  const value = field.value ?? '';
  // A record may point at an option that is no longer offered: keep it visible instead of showing "nothing chosen".
  const missing =
    value !== '' && !loading && !options.some((option) => String(option.value) === String(value));
  return (
    <FormField label={label} required={required} error={fieldState.error?.message} hint={hint}>
      {(control) => (
        <NativeSelect
          {...control}
          name={field.name}
          ref={field.ref}
          value={value}
          onChange={(event) => {
            field.onChange(event);
            onValueChange?.(event.target.value);
          }}
          onBlur={field.onBlur}
          disabled={loading || disabled || field.disabled}
        >
          {emptyLabel !== undefined && (
            <option value="">{loading ? 'Loading…' : emptyLabel}</option>
          )}
          {missing && (
            <option value={value}>{`${selectedLabel ?? `#${value}`} (no longer offered)`}</option>
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
