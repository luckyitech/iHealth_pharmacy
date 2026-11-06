/**
 * @typedef {{ id: number, label: string, detail?: string | null, hospitalId?: number | null, hospitalName?: string | null }} PickedDoctor
 * @typedef {{ id: number, label: string }} PickedHospital
 * @typedef {object} TillPrescription
 * @property {PickedDoctor | null} doctor
 * @property {PickedHospital | null} hospital
 * @property {string} prescribedOn `YYYY-MM-DD`, or empty.
 * @property {string | null} photo A data URL of the photo, made smaller.
 * @property {string} patientIdNumber For controlled drugs: the patient's ID or passport number.
 */

/**
 * @typedef {'customerName' | 'customerPhone' | 'doctorId' | 'prescribedOn' | 'patientIdNumber'} RegisterField
 */

/** @type {Readonly<TillPrescription>} */
export const NO_PRESCRIPTION = Object.freeze({
  doctor: null,
  hospital: null,
  prescribedOn: '',
  photo: null,
  patientIdNumber: '',
});

/** What a controlled drug cannot be sold without, as the strip names it. */
export const REGISTER_FIELDS = Object.freeze({
  customerName: "patient's name",
  customerPhone: 'phone',
  patientIdNumber: 'ID number',
  doctorId: 'doctor',
  prescribedOn: 'prescription date',
});

/**
 * What the controlled-drug register still needs before the sale can be paid.
 *
 * @param {TillPrescription} prescription
 * @param {{ name: string | null, phone: string | null } | null} customer
 * @returns {RegisterField[]}
 */
export function missingForRegister(prescription, customer) {
  /** @type {Record<RegisterField, boolean>} */
  const filled = {
    customerName: Boolean(customer?.name?.trim()),
    customerPhone: Boolean(customer?.phone?.trim()),
    patientIdNumber: Boolean(prescription.patientIdNumber.trim()),
    doctorId: Boolean(prescription.doctor),
    prescribedOn: Boolean(prescription.prescribedOn),
  };
  return /** @type {RegisterField[]} */ (Object.keys(REGISTER_FIELDS)).filter(
    (field) => !filled[field],
  );
}

/**
 * @param {TillPrescription} prescription
 * @returns {{ doctorId?: number, hospitalId?: number, prescribedOn?: string, photo?: string, patientIdNumber?: string } | undefined}
 *   What the sale sends; nothing when no part was filled in.
 */
export function prescriptionForApi(prescription) {
  const body = {
    ...(prescription.doctor ? { doctorId: prescription.doctor.id } : {}),
    ...(prescription.hospital ? { hospitalId: prescription.hospital.id } : {}),
    ...(prescription.prescribedOn ? { prescribedOn: prescription.prescribedOn } : {}),
    ...(prescription.photo ? { photo: prescription.photo } : {}),
    ...(prescription.patientIdNumber.trim()
      ? { patientIdNumber: prescription.patientIdNumber.trim() }
      : {}),
  };
  return Object.keys(body).length ? body : undefined;
}

/**
 * @param {import('./prescriptions-api.js').Doctor} doctor
 * @returns {PickedDoctor}
 */
export const pickedDoctor = (doctor) => ({
  id: doctor.id,
  label: doctor.name,
  detail: [doctor.licenseNumber && `Lic. ${doctor.licenseNumber}`, doctor.hospitalName]
    .filter(Boolean)
    .join(' · '),
  hospitalId: doctor.hospitalId,
  hospitalName: doctor.hospitalName,
});

/**
 * Choosing a doctor fills the hospital with theirs, unless one was chosen already.
 *
 * @param {TillPrescription} prescription
 * @param {PickedDoctor | null} doctor
 * @returns {TillPrescription}
 */
export function withDoctor(prescription, doctor) {
  const hospital =
    prescription.hospital ??
    (doctor?.hospitalId ? { id: doctor.hospitalId, label: doctor.hospitalName ?? '' } : null);
  return { ...prescription, doctor, hospital };
}
