/* eslint-disable jsdoc/reject-any-type -- works with any form; the field names come from each master's schema */
import { Input } from '@/components/ui/input';

import { FormField } from './form-field.jsx';

/**
 * A labelled text input bound to a React Hook Form field.
 *
 * @param {object} props
 * @param {import('react-hook-form').UseFormReturn<any>} props.form
 * @param {string} props.name
 * @param {string} props.label
 * @param {string} [props.type]
 * @param {string} [props.autoComplete]
 * @param {string} [props.inputMode]
 * @param {React.ReactNode} [props.hint]
 * @param {string} [props.className]
 * @returns {React.JSX.Element}
 */
export function TextField({
  form,
  name,
  label,
  type = 'text',
  autoComplete = 'off',
  inputMode,
  hint,
  className,
}) {
  const error = /** @type {{ message?: string } | undefined} */ (form.formState.errors[name])
    ?.message;
  return (
    <FormField
      form={form}
      name={name}
      label={label}
      error={error}
      hint={hint}
      className={className}
    >
      {(control) => (
        <Input
          {...control}
          type={type}
          autoComplete={autoComplete}
          inputMode={/** @type {any} */ (inputMode)}
          {...form.register(name)}
        />
      )}
    </FormField>
  );
}
