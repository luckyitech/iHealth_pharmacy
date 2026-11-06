import { describe, expect, it } from 'vitest';

import { NO_PRESCRIPTION, pickedDoctor, prescriptionForApi, withDoctor } from './prescription.js';

const DOCTOR = pickedDoctor({
  id: 7,
  name: 'Amani Demo',
  licenseNumber: 'TEST-0001',
  hospitalId: 3,
  hospitalName: 'Sample Medical Centre',
});

describe('the prescription on the till', () => {
  it('sends nothing until a part is filled in, then only the parts filled in', () => {
    expect(prescriptionForApi(NO_PRESCRIPTION)).toBeUndefined();
    expect(prescriptionForApi({ ...NO_PRESCRIPTION, prescribedOn: '2026-11-01' })).toEqual({
      prescribedOn: '2026-11-01',
    });
  });

  it("fills the hospital with the doctor's own, unless one was chosen", () => {
    expect(DOCTOR.detail).toBe('Lic. TEST-0001 · Sample Medical Centre');
    expect(withDoctor(NO_PRESCRIPTION, DOCTOR).hospital).toEqual({
      id: 3,
      label: 'Sample Medical Centre',
    });
    const chosen = { ...NO_PRESCRIPTION, hospital: { id: 9, label: 'Other Clinic' } };
    expect(withDoctor(chosen, DOCTOR).hospital).toEqual({ id: 9, label: 'Other Clinic' });
    expect(prescriptionForApi(withDoctor(chosen, DOCTOR))).toEqual({ doctorId: 7, hospitalId: 9 });
  });
});
