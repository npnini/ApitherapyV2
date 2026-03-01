import { doc, setDoc, addDoc, collection, serverTimestamp, getDoc, query, orderBy, getDocs, QueryDocumentSnapshot, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { PatientData, MedicalData, QuestionnaireResponse, MeasuredValueReading, Treatment } from '../types/patient';

/**
 * Saves or updates patient personal details in the 'patients' collection.
 */
export const savePatient = async (patientData: Partial<PatientData>, patientId?: string) => {
    let patientDocRef;
    if (patientId) {
        patientDocRef = doc(db, 'patients', patientId);
    } else {
        patientDocRef = doc(collection(db, 'patients'));
    }

    const timestamp = serverTimestamp();
    const dataToSave = {
        ...patientData,
        updatedTimestamp: timestamp,
    };

    if (!patientId) {
        (dataToSave as any).createdTimestamp = timestamp;
    }

    await setDoc(patientDocRef, dataToSave, { merge: true });
    return patientDocRef.id;
};

/**
 * Saves or updates medical data in the root 'patient_medical_data' collection.
 */
export const saveMedicalData = async (patientId: string, medicalData: Partial<MedicalData>) => {
    // We use patientId as the document ID for singleton medical data for easy lookup
    const medicalDocRef = doc(db, 'patient_medical_data', patientId);
    const timestamp = serverTimestamp();

    const dataToSave = {
        ...medicalData,
        patientId,
        updatedTimestamp: timestamp,
    };

    const docSnap = await getDoc(medicalDocRef);
    if (!docSnap.exists()) {
        (dataToSave as any).createdTimestamp = timestamp;
    }

    await setDoc(medicalDocRef, dataToSave, { merge: true });
    return patientId;
};

/**
 * Upserts a questionnaire response using a deterministic doc ID ({patientId}_{domain}).
 * This ensures only one response exists per patient per domain, regardless of how many times it is called.
 */
export const addQuestionnaireResponse = async (patientId: string, response: Partial<QuestionnaireResponse>) => {
    const domain = response.domain;
    if (!domain) {
        console.warn('addQuestionnaireResponse: no domain set, skipping save.');
        return;
    }
    // Use a deterministic ID to prevent duplicates
    const docId = `${patientId}_${domain}`;
    const docRef = doc(db, 'questionnaire_responses', docId);
    const timestamp = serverTimestamp();

    return await setDoc(docRef, {
        ...response,
        patientId,
        updatedTimestamp: timestamp,
    }, { merge: true });
};

/**
 * Adds a measured value reading using a patientId-prefixed document ID.
 * Format: {patientId}_{timestamp} — allows fetching the latest reading for a
 * patient via a __name__ range query without requiring a composite index.
 */
export const addMeasuredValueReading = async (patientId: string, reading: Partial<MeasuredValueReading>) => {
    // We use a fixed length for the timestamp (e.g., 13 digits) to ensure correct lexicographical ordering
    const timestamp = Date.now();
    const docId = `${patientId}_${timestamp}`;
    const docRef = doc(db, 'measured_values', docId);
    const serverTs = serverTimestamp();

    return await setDoc(docRef, {
        ...reading,
        patientId,
        createdTimestamp: serverTs,
        updatedTimestamp: serverTs
    });
};

/**
 * Saves a treatment to the root 'treatments' collection.
 */
export const saveTreatment = async (patientId: string, treatment: Partial<Treatment>) => {
    const timestamp = Date.now();
    const docId = `${patientId}_${timestamp}`;
    const docRef = doc(db, 'treatments', docId);
    const serverTs = serverTimestamp();

    await setDoc(docRef, {
        ...treatment,
        patientId,
        createdTimestamp: serverTs,
        updatedTimestamp: serverTs
    });
    return docRef.id;
};

/**
 * Fetches measured value readings for a patient from the root collection using document ID range query.
 */
export const getMeasuredValueReadings = async (patientId: string): Promise<MeasuredValueReading[]> => {
    const colRef = collection(db, 'measured_values');
    const q = query(
        colRef,
        where('__name__', '>=', `${patientId}_`),
        where('__name__', '<=', `${patientId}_\uf8ff`),
        orderBy('__name__', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc: QueryDocumentSnapshot) => ({
        ...doc.data(),
        id: doc.id
    })) as unknown as MeasuredValueReading[];
};

/**
 * Checks if a patient has any measured value readings.
 */
export const hasMeasuredValueReadings = async (patientId: string): Promise<boolean> => {
    const colRef = collection(db, 'measured_values');
    const q = query(
        colRef,
        where('__name__', '>=', `${patientId}_`),
        where('__name__', '<=', `${patientId}_\uf8ff`),
        limit(1)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
};
