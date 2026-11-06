import { BYTES_PER_KB } from '@ihealth/shared/units';
import { POLICIES } from '@ihealth/shared/permissions';
import { LOGO_TYPES, MAX_LOGO_BYTES, pharmacyProfileInputSchema } from '@ihealth/shared/schemas';

/** @typedef {import('zod').infer<typeof import('@ihealth/shared/schemas').pharmacyProfileSchema>} PharmacyProfile */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { APP_INFO_KEY } from '@/app/use-app-info';
import { AddressFields } from '@/components/form/address-fields';
import { applyServerErrors, useZodForm } from '@/components/form/use-zod-form';
import { TextField } from '@/components/form/text-field';
import { PageState } from '@/components/feedback/page-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckboxField } from '@/components/ui/checkbox-field';
import { FormError } from '@/components/ui/form-error';
import { RequiredLegend } from '@/components/ui/label';
import { usePermissions } from '@/features/auth/use-permissions';
import { api, API_BASE_URL } from '@/lib/api-client';
import { errorMessage } from '@/lib/api-error';
import { notify } from '@/lib/notify';

import { formValuesFor } from '../master-columns.jsx';
import { SalesSettingsCard } from './sales-settings-card.jsx';

const RESOURCE = 'masters/pharmacy-profile';
const PROFILE_KEY = ['resource', RESOURCE];
const LOGO_URL = `${API_BASE_URL}/${RESOURCE}/logo`;
const toFormValues = formValuesFor(pharmacyProfileInputSchema, {
  openAllHours: false,
  purchaseOrderApproval: false,
});

/**
 * The pharmacy's own details and logo, as printed on receipts and shown on the sign-in page.
 *
 * @returns {React.JSX.Element}
 */
export default function PharmacyProfilePage() {
  const { hasAny } = usePermissions();
  const canWrite = hasAny(POLICIES.masters.write);
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: async () =>
      /** @type {{ data: PharmacyProfile }} */ (await api.get(RESOURCE).json()).data,
  });
  const form = useZodForm(pharmacyProfileInputSchema, { defaultValues: toFormValues(null) });
  const { reset, setError } = form;

  useEffect(() => {
    if (profile.data) reset(toFormValues(profile.data));
  }, [profile.data, reset]);

  const save = useMutation({
    mutationFn: async (/** @type {Record<string, unknown>} */ values) =>
      /** @type {{ data: PharmacyProfile }} */ (await api.patch(RESOURCE, { json: values }).json())
        .data,
    onSuccess: (data) => {
      queryClient.setQueryData(PROFILE_KEY, data);
      void queryClient.invalidateQueries({ queryKey: APP_INFO_KEY });
      notify.success('Pharmacy details saved');
    },
    onError: (error) => applyServerErrors(error, setError),
  });

  if (profile.isPending) return <PageState state="loading" />;
  if (profile.isError)
    return <PageState state="error" error={profile.error} onRetry={() => void profile.refetch()} />;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pharmacy profile</h1>
        <p className="text-sm text-muted-foreground">
          Shown on the sign-in page and printed on receipts and documents.
        </p>
      </div>

      <LogoCard
        hasLogo={profile.data.hasLogo}
        canWrite={canWrite}
        onSaved={() => void profile.refetch()}
      />

      <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))}>
        <fieldset disabled={!canWrite || save.isPending} className="grid gap-6">
          {canWrite && <RequiredLegend />}
          {save.isError && !applyServerErrors(save.error, () => {}) && (
            <FormError>{errorMessage(save.error)}</FormError>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Business details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <TextField form={form} name="name" label="Pharmacy name" />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField form={form} name="taxId" label="Tax PIN" />
                <TextField form={form} name="phone" label="Phone" type="tel" />
                <TextField form={form} name="email" label="Email" type="email" />
                <TextField form={form} name="fax" label="Fax" type="tel" />
              </div>
              <TextField form={form} name="website" label="Website" type="url" />
              <TextField
                form={form}
                name="bccEmail"
                label="Copy outgoing emails to"
                type="email"
                hint="Quotations and purchase orders sent by email are also copied here."
              />
              <CheckboxField label="Open 24 hours" {...form.register('openAllHours')} />
              <CheckboxField
                label="Purchase orders need approval"
                description="Orders must be approved before they can be sent to suppliers."
                {...form.register('purchaseOrderApproval')}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Responsible person</CardTitle>
              <CardDescription>The contact for regulatory and supplier matters.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <TextField form={form} name="contactFirstName" label="First name" />
              <TextField form={form} name="contactMiddleName" label="Middle name" />
              <TextField form={form} name="contactLastName" label="Last name" />
              <TextField form={form} name="contactPhone" label="Phone" type="tel" />
              <TextField
                form={form}
                name="contactEmail"
                label="Email"
                type="email"
                className="sm:col-span-2"
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <AddressFields form={form} />
            </CardContent>
          </Card>

          {canWrite && (
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
                Save changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => reset(toFormValues(profile.data))}
              >
                Discard changes
              </Button>
            </div>
          )}
        </fieldset>
      </form>

      <SalesSettingsCard canWrite={canWrite} />
    </div>
  );
}

/**
 * @param {{ hasLogo: boolean, canWrite: boolean, onSaved: () => void }} props
 * @returns {React.JSX.Element}
 */
function LogoCard({ hasLogo, canWrite, onSaved }) {
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [version, setVersion] = useState(0);
  const upload = useMutation({
    mutationFn: async (/** @type {File} */ file) => {
      await api.put(`${RESOURCE}/logo`, { body: file, headers: { 'content-type': file.type } });
    },
    onSuccess: () => {
      setVersion((current) => current + 1);
      onSaved();
      notify.success('Logo updated');
    },
  });

  const choose = (/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO_BYTES) {
      notify.error(
        `Choose a PNG, JPEG or WebP image of at most ${MAX_LOGO_BYTES / BYTES_PER_KB} kB.`,
      );
      return;
    }
    upload.mutate(file);
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-5">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
          {hasLogo || version > 0 ? (
            <img
              src={`${LOGO_URL}?v=${version}`}
              alt="Pharmacy logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <ImageUp aria-hidden="true" className="size-7 text-muted-foreground" />
          )}
        </div>
        <div className="grid flex-1 gap-1">
          <p className="font-medium">Logo</p>
          <p className="text-sm text-muted-foreground">
            PNG, JPEG or WebP, up to {MAX_LOGO_BYTES / BYTES_PER_KB} kB. A square image works best.
          </p>
          {upload.isError && <FormError className="mt-2">{errorMessage(upload.error)}</FormError>}
        </div>
        {canWrite && (
          <>
            <input
              ref={input}
              type="file"
              accept={LOGO_TYPES.join(',')}
              className="sr-only"
              onChange={choose}
              aria-label="Choose a logo image"
              tabIndex={-1}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => input.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
              {hasLogo ? 'Replace logo' : 'Upload logo'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
