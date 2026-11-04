import {
  itemInputSchema,
  loginBodySchema,
  providerInputSchema,
  supplierInputSchema,
} from '@ihealth/shared/schemas';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TextField } from './text-field.jsx';
import { requiredFieldsOf, useZodForm } from './use-zod-form.js';

describe('requiredFieldsOf', () => {
  it('reads the required fields from the shared schemas', () => {
    expect([...requiredFieldsOf(loginBodySchema)].sort()).toEqual(['identifier', 'password']);
    const item = requiredFieldsOf(itemInputSchema);
    expect(item.has('name')).toBe(true);
    expect(item.has('manufacturerId')).toBe(true);
    expect(item.has('code')).toBe(false);
    expect(item.has('description')).toBe(false);
    expect(requiredFieldsOf(providerInputSchema).has('licenseNumber')).toBe(false);
    const supplier = requiredFieldsOf(supplierInputSchema);
    expect(supplier.has('countryId')).toBe(true);
    expect(supplier.has('phone')).toBe(false);
  });
});

function ItemNameAndCode() {
  const form = useZodForm(itemInputSchema);
  return (
    <>
      <TextField form={form} name="name" label="Name" />
      <TextField form={form} name="code" label="Item code" />
    </>
  );
}

describe('form labels', () => {
  it('marks required fields with an asterisk and aria-required, and optional ones with nothing', () => {
    render(<ItemNameAndCode />);
    const name = screen.getByLabelText('Name');
    expect(name).toHaveAttribute('aria-required', 'true');
    expect(name.closest('div')?.querySelector('[aria-hidden="true"]')).toHaveTextContent('*');
    const code = screen.getByLabelText('Item code');
    expect(code).not.toHaveAttribute('aria-required');
    expect(screen.queryByText(/optional/)).not.toBeInTheDocument();
  });
});
