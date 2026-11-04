/* eslint-disable jsdoc/reject-any-type -- works with any form that has the standard address fields */
import { useCountries, useProvinces } from '@/lib/lookups';

import { SelectField } from './select-field.jsx';
import { TextField } from './text-field.jsx';

/**
 * @param {{ data?: { id: number, name: string }[] }} query
 * @returns {{ value: number, label: string }[]}
 */
const toOptions = (query) =>
  (query.data ?? []).map((option) => ({ value: option.id, label: option.name }));

/**
 * Address lines, city, postal code, country and province. Provinces follow the chosen country.
 * Field names: addressLine1, addressLine2, city, zip, countryId, provinceId.
 *
 * Which of them are required comes from the form's schema.
 *
 * @param {{ form: import('react-hook-form').UseFormReturn<any> }} props
 * @returns {React.JSX.Element}
 */
export function AddressFields({ form }) {
  const countryId = form.watch('countryId');
  const countries = useCountries();
  const provinces = useProvinces(countryId ? Number(countryId) : null);

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
        <SelectField
          form={form}
          name="countryId"
          label="Country"
          emptyLabel="Choose a country"
          loading={countries.isPending}
          options={toOptions(countries)}
          onValueChange={() => form.setValue('provinceId', '')}
        />
        <SelectField
          form={form}
          name="provinceId"
          label="Province or county"
          emptyLabel={countryId ? 'Choose' : 'Choose a country first'}
          loading={Boolean(countryId) && provinces.isPending}
          disabled={!countryId}
          options={toOptions(provinces)}
        />
      </div>
    </fieldset>
  );
}
