import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app } from '../firebase';

const storage = getStorage(app);

/**
 * Uploads a file to Firebase Storage.
 * @param file The file to upload.
 * @param folderPath The path in storage to upload the file to (e.g., 'point_documents').
 * @returns A promise that resolves with the public download URL of the file.
 */
export const uploadFile = async (file: File, folderPath: string): Promise<string> => {
    if (!file) {
        throw new Error("No file provided for upload.");
    }
    const fileName = `${new Date().getTime()}_${file.name}`;
    const storageRef = ref(storage, `${folderPath}/${fileName}`);
    
    await uploadBytes(storageRef, file);
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
