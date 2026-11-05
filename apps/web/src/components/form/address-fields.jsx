/* eslint-disable jsdoc/reject-any-type -- works with any form that has the standard address fields */
import { NativeSelect } from '@/components/ui/native-select';
import { useCountries, useProvinces } from '@/lib/lookups';

import { FormField } from './form-field.jsx';
import { TextField } from './text-field.jsx';

/**
 * Address lines, city, postal code, country and province. Provinces follow the chosen country.
 * Field names: addressLine1, addressLine2, city, zip, countryId, provinceId.
 *
 * @param {{ form: import('react-hook-form').UseFormReturn<any> }} props
 * @returns {React.JSX.Element}
 */
export function AddressFields({ form }) {
  const countryId = form.watch('countryId');
  const countries = useCountries();
  const provinces = useProvinces(countryId ? Number(countryId) : null);
  const errors = /** @type {Record<string, { message?: string }>} */ (form.formState.errors);

  return (
    <fieldset className="grid gap-4">
      <legend className="mb-1 text-sm font-semibold">Address</legend>
      <TextField
        form={form}
        name="addressLine1"
        label="Address line 1"
        autoComplete="address-line1"
      />
      <TextField
        form={form}
        name="addressLine2"
        label="Address line 2"
        autoComplete="address-line2"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField form={form} name="city" label="City or town" autoComplete="address-level2" />
        <TextField form={form} name="zip" label="Postal code" autoComplete="postal-code" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Country" error={errors.countryId?.message}>
          {(control) => (
            <NativeSelect
              {...control}
              {...form.register('countryId', { onChange: () => form.setValue('provinceId', '') })}
              disabled={countries.isPending}
            >
              <option value="">{countries.isPending ? 'Loading…' : 'Choose a country'}</option>
              {countries.data?.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Province or county" error={errors.provinceId?.message}>
          {(control) => (
            <NativeSelect
              {...control}
              {...form.register('provinceId')}
              disabled={!countryId || provinces.isPending}
            >
              <option value="">{countryId ? 'Choose' : 'Choose a country first'}</option>
              {provinces.data?.map((province) => (
                <option key={province.id} value={province.id}>
                  {province.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
    </fieldset>
  );
}
