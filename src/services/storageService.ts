import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirestore, collection, query, getDocs, orderBy } from 'firebase/firestore';
import { app } from '../firebase';
import { Treatment } from '../types/treatment';

const storage = getStorage(app);
const db = getFirestore(app);

/**
 * Uploads a file to Firebase Storage.
 * @param file The file to upload.
 * @param folderPath The path in storage to upload the file to (e.g., 'point_documents').
 * @param customFileName Optional custom filename.
 * @returns A promise that resolves with the public download URL of the file.
 */
export const uploadFile = async (file: File, folderPath: string, customFileName?: string): Promise<string> => {
    if (!file) {
        throw new Error("No file provided for upload.");
    }
    const fileName = customFileName ? `${new Date().getTime()}_${customFileName}` : `${new Date().getTime()}_${file.name}`;
    const storageRef = ref(storage, `${folderPath}/${fileName}`);

    // Set metadata to ensure correct encoding (especially for Hebrew/UTF-8)
    const metadata: any = {};
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        metadata.contentType = (file.type || 'text/plain') + '; charset=utf-8';
    } else if (file.type) {
        metadata.contentType = file.type;
    }

    await uploadBytes(storageRef, file, metadata);
    const downloadURL = await getDownloadURL(storageRef);

    return downloadURL;
};

/**
 * Deletes a file from Firebase Storage using its download URL.
 * @param fileUrl The public download URL of the file to delete.
 * @returns A promise that resolves when the file is deleted.
 */
export const deleteFile = async (fileUrl: string): Promise<void> => {
    if (!fileUrl) {
        return;
    }

    try {
        const storageRef = ref(storage, fileUrl);
        await deleteObject(storageRef);
    } catch (error: any) {
        console.error("Error deleting file from storage:", error);
        if (error.code === 'storage/object-not-found') {
            console.warn('Attempted to delete a file that does not exist in storage.');
        } else {
            throw new Error('Failed to delete the file.');
        }
    }
};

/**
 * Fetches all treatments for a specific patient, ordered by date.
 * @param patientId The ID of the patient.
 * @returns A promise that resolves to an array of treatments.
 */
export const getTreatmentsByPatientId = async (patientId: string): Promise<Treatment[]> => {
    if (!patientId) {
        throw new Error("Patient ID is required to fetch treatments.");
    }

    const treatmentsRef = collection(db, 'patients', patientId, 'medical_records', 'patient_level_data', 'treatments');
    const q = query(treatmentsRef, orderBy("date", "desc"));

    try {
        const querySnapshot = await getDocs(q);
        const treatments: Treatment[] = [];
        querySnapshot.forEach((doc) => {
            treatments.push({ id: doc.id, ...doc.data() } as Treatment);
        });
        return treatments;
    } catch (error) {
        console.error("Error fetching treatments:", error);
        throw new Error('Failed to fetch treatments.');
    }
};
