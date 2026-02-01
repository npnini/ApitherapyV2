
// types.ts

export interface User {
  email: string;
  userId: string;
  fullName: string;
  mobile: string;
  role: 'caretaker' | 'admin';
}

export interface PatientData {
  id: string;
  fullName: string;
  identityNumber: string;
  email: string;
  mobile: string;
  condition: string;
  severity: 'Mild' | 'Moderate' | 'Severe';
  caretakerId: string;
  lastTreatment: string;
}

export interface BloodPressure {
    systolic: number;
    diastolic: number;
}

export interface StingPoint {
  id: string;
  name: string;
  explanation: string;
  position: { top: string; left: string; }; // Will be converted to 3D coords
}

export interface TreatmentSession {
    id: string;
    patientId: string;
    date: string;
    durationMinutes: number;
    report: string; // Patient's initial report
    finalNotes: string; // Caretaker's notes at the end
    beeStingCount: number;
    painLevel: number;
    bloodPressure: BloodPressure;
    heartRate: number;
    stungPoints?: StingPoint[];
}
