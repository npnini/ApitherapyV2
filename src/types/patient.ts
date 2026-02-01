export interface PatientData {
    id: string;
    fullName: string;
    age: number;
    identityNumber: string;
    email: string;
    mobile: string;
    condition: string;
    severity: 'Mild' | 'Moderate' | 'Severe';
    caretakerId: string;
    lastTreatment?: string;
}
