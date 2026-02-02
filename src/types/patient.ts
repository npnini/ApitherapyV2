export interface PatientData {
    id: string;
    fullName: string;
    birthDate: string; // Storing date as a string in ISO format (YYYY-MM-DD)
    identityNumber: string;
    email: string;
    mobile: string;
    condition: string;
    severity: 'Mild' | 'Moderate' | 'Severe';
    caretakerId: string;
    lastTreatment?: string;
}
