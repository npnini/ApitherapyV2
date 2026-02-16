export interface MedicalRecord {
    signature?: string;
}

export interface QuestionnaireResponse {
    domain: string;
    version: number;
    dateUpdated: Date;
    [key: string]: any; 
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
    medicalRecord?: Partial<MedicalRecord & QuestionnaireResponse>;
}