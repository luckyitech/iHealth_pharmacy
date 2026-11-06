import { Camera, FileText, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';

import { useAppInfo } from '@/app/use-app-info';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomerTypeahead } from '@/features/customers/customer-typeahead';
import { wallClockNow } from '@/lib/format';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

import { LookupPicker } from './lookup-picker.jsx';
import { NewDoctorDialog } from './new-doctor-dialog.jsx';
import { shrinkPhoto } from './photo.js';
import { pickedDoctor, withDoctor } from './prescription.js';
import { useDoctorSearch, useHospitalSearch } from './prescriptions-api.js';

/**
 * The prescription a sale is made against. For prescription-only medicines and antibiotics every
 * part is optional: the cashier is reminded, not stopped. A controlled drug needs the patient's
 * name, phone and ID number, the doctor and the date, for the controlled-drug register; the
 * patient is the sale's customer.
 *
 * @param {object} props
 * @param {number} props.itemCount Lines that need a prescription.
 * @param {number} props.controlledCount Lines of controlled drugs.
 * @param {import('./prescription.js').TillPrescription} props.value
 * @param {(value: import('./prescription.js').TillPrescription) => void} props.onChange
 * @param {import('../till/till-state.js').TillCustomer | null} props.customer
 * @param {(customer: import('../till/till-state.js').TillCustomer | null) => void} props.onCustomer
 * @param {Partial<Record<import('./prescription.js').RegisterField | 'photo' | 'hospitalId', string>>} props.errors From the server.
 * @param {number} props.photoMaxKb
 * @param {React.Ref<HTMLInputElement>} props.doctorRef Focused by the shortcut.
 * @returns {React.JSX.Element}
 */
export function PrescriptionStrip({
  itemCount,
  controlledCount,
  value,
  onChange,
  customer,
  onCustomer,
  errors,
  photoMaxKb,
  doctorRef,
}) {
  const controlled = controlledCount > 0;
  const [newDoctor, setNewDoctor] = useState(/** @type {string | null} */ (null));
  const [reading, setReading] = useState(false);
  const today = wallClockNow(useAppInfo().data?.region.timeZone).slice(0, 10);

  /**
   * @param {File | undefined} file
   * @returns {Promise<void>}
   */
  const attach = async (file) => {
    if (!file) return;
    setReading(true);
    try {
      onChange({ ...value, photo: await shrinkPhoto(file, photoMaxKb) });
    } catch (error) {
      notify.failure('Could not attach the photo', error);
    } finally {
      setReading(false);
    }
  };

  return (
    <section
      aria-labelledby="prescription-heading"
      className={cn(
        'grid gap-3 rounded-lg border p-4',
        controlled ? 'border-destructive/50 bg-destructive/5' : 'border-primary/40 bg-primary/5',
      )}
    >
      <div>
        <h2 id="prescription-heading" className="flex items-center gap-2 text-sm font-semibold">
          {controlled ? (
            <ShieldAlert aria-hidden="true" className="size-4 text-destructive" />
          ) : (
            <FileText aria-hidden="true" className="size-4 text-primary" />
          )}
          {controlled ? 'Controlled drug' : 'Prescription'}
          <span className="font-normal text-muted-foreground">
            {controlled
              ? 'required for the register'
              : `recommended · ${itemCount} ${itemCount === 1 ? 'item needs' : 'items need'} one`}
          </span>
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {controlled && (
          <>
            <FormField label="Patient's name" required error={errors.customerName}>
              {(control) => (
                <CustomerTypeahead
                  control={control}
                  value={customer?.name ?? ''}
                  // A typed name is no longer the registered customer picked before.
                  onChange={(name) => onCustomer({ name, phone: customer?.phone ?? null })}
                  onPick={onCustomer}
                />
              )}
            </FormField>
            <FormField label="Phone" required error={errors.customerPhone}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="tel"
                  value={customer?.phone ?? ''}
                  onChange={(event) =>
                    onCustomer({ name: customer?.name ?? null, phone: event.target.value })
                  }
                />
              )}
            </FormField>
            <FormField
              label="ID or passport number"
              required
              error={errors.patientIdNumber}
              className="sm:col-span-2 sm:max-w-[calc(50%-0.375rem)]"
            >
              {(control) => (
                <Input
                  {...control}
                  value={value.patientIdNumber}
                  onChange={(event) => onChange({ ...value, patientIdNumber: event.target.value })}
                />
              )}
            </FormField>
          </>
        )}
        <LookupPicker
          label="Doctor"
          placeholder="Name or licence number"
          required={controlled}
          error={errors.doctorId}
          inputRef={doctorRef}
          value={value.doctor}
          onChange={(doctor) => onChange(withDoctor(value, doctor))}
          useSearch={useDoctorSearch}
          toOption={pickedDoctor}
          failure="Could not search the doctors"
          empty="No doctor found"
          footer={(typed) => (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
              onClick={() => setNewDoctor(typed)}
            >
              <UserPlus aria-hidden="true" className="size-4" /> Add “{typed}” as a new doctor
            </button>
          )}
        />
        <LookupPicker
          label="Hospital"
          placeholder="Hospital or clinic"
          value={value.hospital}
          onChange={(hospital) => onChange({ ...value, hospital })}
          useSearch={useHospitalSearch}
          toOption={(hospital) => ({ id: hospital.id, label: hospital.name })}
          failure="Could not search the hospitals"
          empty="No hospital found"
          error={errors.hospitalId}
        />
        <FormField label="Prescription date" required={controlled} error={errors.prescribedOn}>
          {(control) => (
            <Input
              {...control}
              type="date"
              max={today}
              value={value.prescribedOn}
              onChange={(event) => onChange({ ...value, prescribedOn: event.target.value })}
            />
          )}
        </FormField>
        <FormField label="Photo" hint={value.photo ? undefined : 'Optional'} error={errors.photo}>
          {(control) =>
            value.photo ? (
              <div className="flex items-center gap-2">
                <img
                  src={value.photo}
                  alt="The prescription"
                  className="size-9 rounded border object-cover"
                />
                <span className="flex-1 text-sm">Attached</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ ...value, photo: null })}
                >
                  <Trash2 aria-hidden="true" /> Remove
                </Button>
              </div>
            ) : (
              <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent focus-within:ring-[3px] focus-within:ring-ring/50">
                <Camera aria-hidden="true" className="size-4" />
                {reading ? 'Reading…' : 'Add photo'}
                <input
                  {...control}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  disabled={reading}
                  onChange={(event) => {
                    void attach(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </label>
            )
          }
        </FormField>
      </div>

      <NewDoctorDialog
        name={newDoctor}
        hospital={value.hospital}
        onClose={() => setNewDoctor(null)}
        onAdded={(doctor) => {
          setNewDoctor(null);
          onChange(withDoctor(value, pickedDoctor(doctor)));
        }}
      />
    </section>
  );
}
