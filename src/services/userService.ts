import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '../firebase';
import { UserTermsConfig } from '../types/userTerms';

/**
 * Registration, roles and User Terms (Functional Spec – Registration, Roles, Plans and User Terms).
 * role, plan and the User Terms fields are written by Cloud Functions only; these are the app's calls.
 */

/** F2: creates users/{uid} as a learner on the free plan, if it does not exist. */
export const registerUser = async (): Promise<{ created: boolean }> => {
    const result = await httpsCallable(functions, 'registerUser')({});
    return result.data as { created: boolean };
};

/** F3: accepts the current User Terms version, in the language of the file shown. */
export const acceptUserTerms = async (version: string, language: string): Promise<void> => {
    await httpsCallable(functions, 'acceptUserTerms')({ version, language });
};

/** F3: records a decline in the activity log; the caller then signs the user out. */
export const logUserTermsDeclined = async (version: string | undefined): Promise<void> => {
    await httpsCallable(functions, 'logUserTermsDeclined')({ version: version || '' });
};

/** F4–F6: role change (superadmin only). */
export const setUserRole = async (uid: string, role: string): Promise<void> => {
    await httpsCallable(functions, 'setUserRole')({ uid, role });
};

/** Section 4: records an uploaded User Terms PDF for a version and language (superadmin only). */
export const saveUserTermsFile = async (version: string, language: string, path: string): Promise<void> => {
    await httpsCallable(functions, 'saveUserTermsFile')({ version, language, path });
};

/** Section 4: publishes a version; every user must then accept it (superadmin only). */
export const publishUserTerms = async (version: string): Promise<void> => {
    await httpsCallable(functions, 'publishUserTerms')({ version });
};

/** Reads cfg_app_config/userTerms; {} when it does not exist yet. */
export const getUserTermsConfig = async (): Promise<UserTermsConfig> => {
    const snap = await getDoc(doc(db, 'cfg_app_config', 'userTerms'));
    return snap.exists() ? (snap.data() as UserTermsConfig) : {};
};

/** Roles with access to patient data. learner has the Knowledge Base only. */
export const PATIENT_DATA_ROLES = ['caretaker', 'admin', 'superadmin'];

/** Readable message from a callable error (the Cloud Function's own message when it has one). */
export const callableErrorMessage = (err: unknown, fallback: string): string => {
    const message = (err as { message?: string })?.message;
    return message && message !== 'internal' ? message : fallback;
};
