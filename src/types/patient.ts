import { VitalSigns } from './treatmentSession';

export interface MedicalRecord {
    patient_level_data?: {
        condition?: string;
        severity?: 'mild' | 'moderate' | 'severe';
        lastTreatment?: string;
        consentSignedUrl?: string;
        treatmentInstructionsSignedUrl?: string;
        treatment_plan?: {
            problemIds: string[];
            protocolIds: string[];
            measureIds: string[];
        }
    }
}


export interface MeasuredValueReading {
    id?: string;
    timestamp: any; // serverTimestamp
    readings: Array<{
        measureId: string;
        type: 'Category' | 'Scale';
        value: string | number;
    }>;
}

export interface Treatment {
    id?: string;
    protocolId: string;
    caretakerId: string;
    timestamp: any; // serverTimestamp
    stungPointCodes: string[];
    notes: string;
    patientReport: string;
    preStingVitals: VitalSigns;
    postStingVitals: VitalSigns;
    finalVitals: VitalSigns;
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