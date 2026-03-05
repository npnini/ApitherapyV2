export interface BaseDocument {
    id?: string;
    createdTimestamp: any; // serverTimestamp
    updatedTimestamp: any; // serverTimestamp
}

export interface MedicalData extends BaseDocument {
    patientId: string;
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

export interface MeasuredValueReading extends BaseDocument {
    patientId: string;
    note?: string;
    readings: Array<{
        measureId: string;
        type: 'Category' | 'Scale';
        value: string | number;
    }>;
}


export interface QuestionnaireResponse extends BaseDocument {
    patientId: string;
    domain?: string;
    version?: number;
    signature?: string;
    [key: string]: any; // for answers
}

export interface PatientData extends BaseDocument {
    fullName: string;
    birthDate: string;
    profession: string;
    address: string;
    identityNumber: string;
    email: string;
    mobile: string;
    caretakerId: string;
    gender?: 'male' | 'female';
}

export interface JoinedPatientData extends PatientData {
    medicalRecord?: {
        patient_level_data: Partial<MedicalData>;
    };
    questionnaireResponse?: QuestionnaireResponse;
    /** Readings collected in ProblemsProtocolsTab, to be written after patient ID is resolved. */
    pendingReadings?: Array<{ measureId: string; type: 'Category' | 'Scale'; value: string | number; note?: string }>;
}