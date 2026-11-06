import { Camera, FileText, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';

import { useAppInfo } from '@/app/use-app-info';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { wallClockNow } from '@/lib/format';
import { notify } from '@/lib/notify';

import { LookupPicker } from './lookup-picker.jsx';
import { NewDoctorDialog } from './new-doctor-dialog.jsx';
import { shrinkPhoto } from './photo.js';
import { pickedDoctor, withDoctor } from './prescription.js';
import { useDoctorSearch, useHospitalSearch } from './prescriptions-api.js';

/**
 * The prescription a sale of prescription-only medicines is made against. Every part is optional:
 * the cashier is reminded, not stopped.
 *
 * @param {object} props
 * @param {number} props.itemCount Lines that need a prescription.
 * @param {import('./prescription.js').TillPrescription} props.value
 * @param {(value: import('./prescription.js').TillPrescription) => void} props.onChange
 * @param {number} props.photoMaxKb
 * @param {React.Ref<HTMLInputElement>} props.doctorRef Focused by the shortcut.
 * @returns {React.JSX.Element}
 */
export function PrescriptionStrip({ itemCount, value, onChange, photoMaxKb, doctorRef }) {
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
      className="grid gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4"
    >
      <div>
        <h2 id="prescription-heading" className="flex items-center gap-2 text-sm font-semibold">
          <FileText aria-hidden="true" className="size-4 text-primary" />
          Prescription
          <span className="font-normal text-muted-foreground">
            recommended · {itemCount} {itemCount === 1 ? 'item needs' : 'items need'} one
          </span>
        </h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LookupPicker
          label="Doctor"
          placeholder="Name or licence number"
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
        />
        <FormField label="Prescription date">
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
        <FormField label="Photo" hint={value.photo ? undefined : 'Optional'}>
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
