import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

const functions = getFunctions(app, 'me-west1');

interface SendDocumentEmailParams {
    patientId: string;
    documentUrl: string;
    language: string;
}

/**
 * Calls the sendDocumentEmail cloud function to send a signed document to a patient.
 */
export const sendDocumentEmail = async (params: SendDocumentEmailParams) => {
    const sendEmailFn = httpsCallable(functions, 'sendDocumentEmail');
    try {
        const result = await sendEmailFn(params);
        return result.data as { success: boolean };
    } catch (error) {
        console.error('Error calling sendDocumentEmail function:', error);
        throw error;
    }
};
