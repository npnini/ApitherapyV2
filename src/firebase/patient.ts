import { doc, setDoc, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PatientData, MedicalRecord, QuestionnaireResponse, MeasuredValueReading, Treatment } from '../types/patient';

export const savePatientIntakeData = async (
    pii: Partial<PatientData>,
    medicalRecord: Partial<MedicalRecord>,
    questionnaireResponse: Partial<QuestionnaireResponse>,
    patientId?: string
) => {
    let patientDocRef;
    if (patientId) {
        patientDocRef = doc(db, 'patients', patientId);
    } else {
        patientDocRef = doc(collection(db, 'patients'));
    }

    await setDoc(patientDocRef, { ...pii, lastUpdated: serverTimestamp() }, { merge: true });

    const medicalRecordDocRef = doc(db, 'patients', patientDocRef.id, 'medical_records', 'patient_level_data');
    const medicalRecordSnapshot = await getDoc(medicalRecordDocRef);

    if (medicalRecordSnapshot.exists()) {
        await setDoc(medicalRecordDocRef, medicalRecord, { merge: true });
    } else {
        await setDoc(medicalRecordDocRef, medicalRecord);
    }

    if (Object.keys(questionnaireResponse).length > 0) {
        const questionnaireResponsesColRef = collection(db, 'patients', patientDocRef.id, 'medical_records', 'patient_level_data', 'questionnaire_responses');
        await addDoc(questionnaireResponsesColRef, { ...questionnaireResponse, dateUpdated: serverTimestamp() });
    }

    return patientDocRef.id;
};

export const addMeasuredValueReading = async (
    patientId: string,
    reading: MeasuredValueReading
) => {
    const readingsColRef = collection(db, 'patients', patientId, 'medical_records', 'patient_level_data', 'measured_values');
    await addDoc(readingsColRef, {
        ...reading,
        timestamp: serverTimestamp()
    });
};

export const saveTreatment = async (
    patientId: string,
    treatment: Omit<Treatment, 'id' | 'timestamp'>
) => {
    const treatmentsColRef = collection(db, 'patients', patientId, 'medical_records', 'patient_level_data', 'treatments');
    await addDoc(treatmentsColRef, {
        ...treatment,
        timestamp: serverTimestamp()
    });
};
