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
    problemId?: string;
    protocolId?: string;
    measureIds?: string[];
}

export interface MeasuredValueReading extends BaseDocument {
    patientId: string;
    treatmentId?: string;
    note?: string;
    usedMeasureIds?: string[];
    readings: Array<{
        measureId: string;
        type: 'Category' | 'Scale';
        value: string | number;
        numericValue?: number;
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
    age: number | string;
}

export interface JoinedPatientData extends PatientData {
    medicalRecord?: Partial<MedicalData>;
    questionnaireResponse?: QuestionnaireResponse;
    /** Readings collected in ProblemsProtocolsTab, to be written after patient ID is resolved. */
    pendingReadings?: Array<{ measureId: string; type: 'Category' | 'Scale'; value: string | number; numericValue?: number; note?: string }>;
}