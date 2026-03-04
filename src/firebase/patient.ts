import { doc, collection, serverTimestamp, getDoc, setDoc, query, orderBy, getDocs, QueryDocumentSnapshot, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { PatientData, MedicalData, QuestionnaireResponse, MeasuredValueReading } from '../types/patient';
import { TreatmentSession } from '../types/treatmentSession';

/**
 * Recursively removes keys with 'undefined' values from an object.
 * Firestore does not support 'undefined' values.
 */
const stripUndefined = (obj: any): any => {
    if (obj && typeof obj === 'object') {
        // If it looks like a Firestore FieldValue (internal structure often has _methodName or similar)
        // or other non-plain objects we want to preserve, return it as is.
        if (obj.constructor?.name === 'FieldValue' ||
            (obj._methodName && typeof obj._methodName === 'string')) {
            return obj;
        }

        const newObj: any = Array.isArray(obj) ? [] : {};
        Object.keys(obj).forEach(key => {
            if (obj[key] !== undefined) {
                newObj[key] = stripUndefined(obj[key]);
            }
        });
        return newObj;
    }
    return obj;
};

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

    await setDoc(patientDocRef, stripUndefined(dataToSave), { merge: true });
    return patientDocRef.id;
};

/**
 * Saves or updates medical data in the root 'patient_medical_data' collection.
 */
export const saveMedicalData = async (patientId: string, medicalData: Partial<MedicalData>) => {
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

    await setDoc(medicalDocRef, stripUndefined(dataToSave), { merge: true });
    return patientId;
};

/**
 * Upserts a questionnaire response using a deterministic doc ID ({patientId}_{domain}).
 */
export const addQuestionnaireResponse = async (patientId: string, response: Partial<QuestionnaireResponse>) => {
    const domain = response.domain;
    if (!domain) {
        console.warn('addQuestionnaireResponse: no domain set, skipping save.');
        return;
    }
    const docId = `${patientId}_${domain}`;
    const docRef = doc(db, 'questionnaire_responses', docId);
    const timestamp = serverTimestamp();

    const dataToSave = {
        ...response,
        patientId,
        updatedTimestamp: timestamp,
    };

    return await setDoc(docRef, stripUndefined(dataToSave), { merge: true });
};

/**
 * Adds a measured value reading using a patientId-prefixed document ID.
 * Format: {patientId}_{timestamp} — lexicographically sortable, no composite index needed.
 */
export const addMeasuredValueReading = async (patientId: string, reading: Partial<MeasuredValueReading>): Promise<string> => {
    const timestamp = Date.now();
    const docId = `${patientId}_${timestamp}`;
    const docRef = doc(db, 'measured_values', docId);
    const serverTs = serverTimestamp();

    const dataToSave = {
        ...reading,
        patientId,
        createdTimestamp: serverTs,
        updatedTimestamp: serverTs
    };

    await setDoc(docRef, stripUndefined(dataToSave));
    return docId;
};

/**
 * Saves a full treatment session to the root 'treatments' collection.
 * Document ID: {patientId}_{Date.now()} — composite key, same pattern as measured_values.
 */
export const saveTreatment = async (
    patientId: string,
    session: Omit<TreatmentSession, 'id' | 'createdTimestamp' | 'updatedTimestamp'>
): Promise<string> => {
    const timestamp = Date.now();
    const docId = `${patientId}_${timestamp}`;
    const docRef = doc(db, 'treatments', docId);
    const serverTs = serverTimestamp();

    const dataToSave = {
        ...session,
        patientId,
        createdTimestamp: serverTs,
        updatedTimestamp: serverTs,
    };

    await setDoc(docRef, stripUndefined(dataToSave));
    return docRef.id;
};

/**
 * Fetches the most recent treatment for a patient.
 */
export const getLatestTreatment = async (patientId: string): Promise<TreatmentSession | null> => {
    const colRef = collection(db, 'treatments');
    const q = query(
        colRef,
        where('__name__', '>=', `${patientId}_`),
        where('__name__', '<=', `${patientId}_\uf8ff`),
        orderBy('__name__', 'desc'),
        limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const d = snapshot.docs[0];
    return { ...d.data(), id: d.id } as unknown as TreatmentSession;
};

/**
 * Updates a treatment session with a feedback measure reading ID and feedback text.
 */
export const updateTreatmentFeedback = async (treatmentId: string, feedbackReadingId: string, feedbackText: string): Promise<void> => {
    const docRef = doc(db, 'treatments', treatmentId);
    await setDoc(docRef, {
        patientFeedbackMeasureReadingId: feedbackReadingId,
        patientFeedback: feedbackText,
        updatedTimestamp: serverTimestamp()
    }, { merge: true });
};

/**
 * Returns the number of treatment sessions recorded for a patient.
 * Uses a __name__ range query — no composite Firestore index required.
 */
export const getTreatmentCount = async (patientId: string): Promise<number> => {
    const colRef = collection(db, 'treatments');
    const q = query(
        colRef,
        where('__name__', '>=', `${patientId}_`),
        where('__name__', '<=', `${patientId}_\uf8ff`)
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
};

/**
 * Fetches all measured value readings for a patient, ordered ascending by document ID (= time).
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
    return snapshot.docs.map((doc) => {
        const data = doc.data();
        let readings = data.readings;

        // Backward compatibility: Handle legacy map-based readings
        if (readings && !Array.isArray(readings) && typeof readings === 'object') {
            readings = Object.entries(readings).map(([measureId, value]) => ({
                measureId,
                value: value as string | number,
                // We'll default to 'Scale' if unknown; most tracked measures are scales/categories
                // The UI will still render simple values correctly.
                type: 'Scale'
            }));
        }

        return {
            ...data,
            readings: readings || [],
            id: doc.id
        } as MeasuredValueReading;
    });
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
