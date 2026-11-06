import { newDoctorBodySchema } from '@ihealth/shared/schemas';

import { TextField } from '@/components/form/text-field';
import { applyServerErrors, useZodForm } from '@/components/form/use-zod-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { notify } from '@/lib/notify';

import { useAddDoctor } from './prescriptions-api.js';

/**
 * Adds a doctor who is not on the list yet, without leaving the sale. The rest of their details can
 * be filled in later under Masters → Providers.
 *
 * @param {object} props
 * @param {string | null} props.name The name typed in the doctor box; null while closed.
 * @param {{ id: number, label: string } | null} props.hospital The hospital already chosen, if any.
 * @param {() => void} props.onClose
 * @param {(doctor: import('./prescriptions-api.js').Doctor) => void} props.onAdded
 * @returns {React.JSX.Element}
 */
export function NewDoctorDialog({ name, hospital, onClose, onAdded }) {
  return (
    <Dialog open={name !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Add a doctor"
        description={
          hospital
            ? `They will be listed under ${hospital.label}. Other details can be added under Masters → Providers.`
            : 'Other details can be added later under Masters → Providers.'
        }
      >
        {/* Mounted while open only, so the form starts from the name just typed. */}
        {name !== null && (
          <DoctorForm
            name={name}
            hospitalId={hospital?.id ?? null}
            onAdded={onAdded}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * @param {string} name e.g. "amani demo"
 * @returns {{ firstName: string, lastName: string }} The first word, and the rest.
 */
const splitName = (name) => {
  const [first = '', ...rest] = name
    .trim()
    .replace(/^dr\.?\s+/i, '')
    .split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
};

/**
 * @param {{ name: string, hospitalId: number | null, onAdded: (doctor: import('./prescriptions-api.js').Doctor) => void, onCancel: () => void }} props
 * @returns {React.JSX.Element}
 */
function DoctorForm({ name, hospitalId, onAdded, onCancel }) {
  const add = useAddDoctor();
  const form = useZodForm(newDoctorBodySchema, {
    defaultValues: { ...splitName(name), licenseNumber: '', phone: '' },
  });

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={form.handleSubmit((values) =>
        add.mutate(
          { ...values, hospitalId },
          {
            onSuccess: (doctor) => {
              notify.success(`${doctor.name} added`);
              onAdded(doctor);
            },
            onError: (error) => {
              applyServerErrors(error, form.setError);
              notify.failure('Could not add the doctor', error);
            },
          },
        ),
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField form={form} name="firstName" label="First name" />
        <TextField form={form} name="lastName" label="Last name" />
        <TextField form={form} name="licenseNumber" label="Licence number" />
        <TextField form={form} name="phone" label="Phone" inputMode="tel" />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={add.isPending}>
          Add doctor
        </Button>
      </div>
    </form>
  );
}
