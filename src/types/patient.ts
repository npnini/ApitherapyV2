export interface MedicalRecord {
    patient_level_data?: {
        condition?: string;
        severity?: 'mild' | 'moderate' | 'severe';
        lastTreatment?: string;
        consentSignedUrl?: string;
    }
}

export interface QuestionnaireResponse {
    domain?: string;
    version?: number;
    dateUpdated?: Date;
    signature?: string;
    [key: string]: any; // for answers
}

export interface PatientData {
    id: string;
    fullName: string;
    birthDate: string;
    profession: string;
    address: string;
    identityNumber: string;
    email: string;
    mobile: string;
    caretakerId: string;
    dateCreated?: Date;
    lastUpdated?: Date;
    medicalRecord?: Partial<MedicalRecord>;
    questionnaireResponse?: Partial<QuestionnaireResponse>;
}