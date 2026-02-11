export interface MedicalRecord {
    condition: string;
    severity: 'Mild' | 'Moderate' | 'Severe';
    lastTreatment?: string;
}

export interface PatientData {
    id: string;
    fullName: string;
    birthDate: string; // Storing date as a string in ISO format (YYYY-MM-DD)
    identityNumber: string;
    email: string;
    mobile: string;
    caretakerId: string;
    medicalRecord: MedicalRecord;
}
