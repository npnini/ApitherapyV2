export interface QuestionnaireData {
    imbalanceDuration?: number;
    imbalanceDurationUnit?: 'W' | 'M';
    takingMedications?: boolean;
    medicationNames?: string;
    histamineSensitivity?: boolean;
    sufferFromAllergies?: boolean;
    allergies?: string;
    heartDisease?: boolean;
    liverDisease?: boolean;
    kidneyDisease?: boolean;
    steroidMedication?: boolean;
    steroidMedicationNames?: string;
    diabetes?: boolean;
    asthma?: boolean;
    highBloodPressure?: boolean;
    lymphNodeInflammation?: boolean;
    pastTuberculosis?: boolean;
    pastSyphilis?: boolean;
    pastGonorrhea?: boolean;
    medicalSupervision?: boolean;
    psychiatricSupervision?: boolean;
    pastSurgery?: boolean;
    plannedSurgery?: boolean;
    birthControlPills?: boolean;
    regularMenstrualCycle?: boolean;
    menstrualPain?: boolean;
    currentlyPregnant?: boolean;
    problemOrigin?: string;
    diet?: string;
    otherConditions?: string;
    aspirin?: boolean;
    betaBlockers?: boolean;
    stungByBee?: boolean;
    beeStingDetails?: string;
    consent?: boolean;
    signature?: string;
}

export interface MedicalRecord {
    condition?: string;
    severity?: 'Mild' | 'Moderate' | 'Severe';
    lastTreatment?: string;
    questionnaire?: Partial<QuestionnaireData>;
}

export interface PatientData {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    birthDate: string; 
    age: string;
    profession: string;
    address: string;
    identityNumber: string;
    email: string;
    mobile: string;
    caretakerId: string;
    medicalRecord?: Partial<MedicalRecord>;
}
