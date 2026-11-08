// src/config/patientListFields.ts
//
// The optional details of the patient list (PatientsDashboard). The patient's initials (avatar)
// and the row actions are always shown; the name and identity number can be hidden (e.g. to
// demonstrate the system without exposing personal details).
//   - Admins choose which of these fields are offered (Application Settings → Patient List).
//   - Each caretaker chooses which of the offered fields to show (My Profile → Patient list details).
// Labels are English source text (translated in the UI).

export type PatientListFieldKey = 'patientName' | 'identity' | 'contact' | 'problems' | 'lastTreatment' | 'nextMeeting' | 'sessionsDone';

export const PATIENT_LIST_FIELDS: { value: PatientListFieldKey; label: string }[] = [
  { value: 'patientName', label: 'Patient name' },
  { value: 'identity', label: 'Identity number' },
  { value: 'contact', label: 'Contact' },
  { value: 'problems', label: 'Problems' },
  { value: 'lastTreatment', label: 'Last Treatment' },
  { value: 'nextMeeting', label: 'Next meeting' },
  { value: 'sessionsDone', label: 'Sessions done' },
];

export const ALL_PATIENT_LIST_FIELD_KEYS: string[] = PATIENT_LIST_FIELDS.map(f => f.value);

/** Fields the admin offers. Missing setting (older config) = every field is offered. */
export const getAvailablePatientListFields = (configured: unknown): string[] =>
  Array.isArray(configured)
    ? ALL_PATIENT_LIST_FIELD_KEYS.filter(k => configured.includes(k))
    : ALL_PATIENT_LIST_FIELD_KEYS;

/** Fields shown in the list: the offered ones, narrowed by the caretaker's own choice (none made = all offered). */
export const getVisiblePatientListFields = (configured: unknown, userChoice: string[] | undefined): string[] => {
  const available = getAvailablePatientListFields(configured);
  return userChoice ? available.filter(k => userChoice.includes(k)) : available;
};
