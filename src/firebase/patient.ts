import { doc, setDoc, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PatientData, MedicalRecord, QuestionnaireResponse } from '../types/patient';

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

    const questionnaireResponsesColRef = collection(db, 'patients', patientDocRef.id, 'medical_records', 'patient_level_data', 'questionnaire_responses');
    await addDoc(questionnaireResponsesColRef, { ...questionnaireResponse, dateUpdated: serverTimestamp() });

    return patientDocRef.id;
};
