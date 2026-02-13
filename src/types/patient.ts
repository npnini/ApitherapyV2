export interface QuestionnaireData {
    q1?: boolean;
    q2?: boolean;
    q3?: boolean;
    comments?: string;
}

export interface MedicalRecord {
    condition?: string;
    severity?: 'Mild' | 'Moderate' | 'Severe';
    lastTreatment?: string;
    questionnaire?: QuestionnaireData;
}

export interface PatientData {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    birthDate: string; // Storing date as a string in ISO format (YYYY-MM-DD)
    age: string;
    profession: string;
    address: string;
    identityNumber: string;
    email: string;
    mobile: string;
    caretakerId: string;
    medicalRecord?: Partial<MedicalRecord>;
}
