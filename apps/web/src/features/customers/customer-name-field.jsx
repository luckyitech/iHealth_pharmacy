/* eslint-disable jsdoc/reject-any-type -- works with any form that has a customer name field */
import { useController } from 'react-hook-form';

import { FormField } from '@/components/form/form-field';

import { CustomerTypeahead } from './customer-typeahead.jsx';

/**
 * A form's customer name field with the customer type-ahead (see `CustomerTypeahead`).
 *
 * @param {object} props
 * @param {import('react-hook-form').UseFormReturn<any>} props.form
 * @param {string} props.name The form's name field.
 * @param {string} props.label
 * @param {(customer: import('./customers-api.js').CustomerOption) => void} props.onPick
 * @param {React.ReactNode} [props.hint]
 * @param {string} [props.className]
 * @returns {React.JSX.Element}
 */
export function CustomerNameField({ form, name, label, onPick, hint, className }) {
  const { field, fieldState } = useController({ name, control: form.control });
  return (
    <FormField
      form={form}
      name={name}
      label={label}
      error={fieldState.error?.message}
      hint={hint}
      className={className}
    >
      {(control) => (
        <CustomerTypeahead
          control={control}
          name={field.name}
          inputRef={field.ref}
          value={String(field.value ?? '')}
          onChange={field.onChange}
          onBlur={field.onBlur}
          onPick={onPick}
        />
      )}
    </FormField>
  );
}
