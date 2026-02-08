
// services/authService.ts

// This file provides functions for user authentication and data retrieval from Firestore.
// It uses the Firebase v10+ SDK and focuses on cost-optimization by using one-time fetches and pagination.

import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut,
    type UserCredential
} from "firebase/auth";
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    getDocs, 
    limit, 
    startAfter,
    type DocumentSnapshot,
    type QuerySnapshot,
    type DocumentData
} from "firebase/firestore";
import { auth, db } from '../firebase';

// --- Authentication Functions ---

/**
 * Registers a new user with email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<UserCredential>} - A promise that resolves with the user credential.
 */
export const registerWithEmail = (email: string, password: string): Promise<UserCredential> => {
  return createUserWithEmailAndPassword(auth, email, password);
};

/**
 * Signs in a user with email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<UserCredential>} - A promise that resolves with the user credential.
 */
export const signInWithEmail = (email: string, password: string): Promise<UserCredential> => {
  return signInWithEmailAndPassword(auth, email, password);
};

/**
 * Signs in a user with their Google account.
 * @returns {Promise<UserCredential>} - A promise that resolves with the user credential.
 */
export const signInWithGoogle = (): Promise<UserCredential> => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

/**
 * Signs out the current user.
 * @returns {Promise<void>} - A promise that resolves when the user is signed out.
 */
export const logout = (): Promise<void> => {
  return signOut(auth);
};

// --- Firestore Data Retrieval Functions ---

/**
 * Fetches a single document from Firestore.
 * @param {string} collectionPath - The path to the collection.
 * @param {string} docId - The ID of the document.
 * @returns {Promise<DocumentSnapshot<DocumentData>>} - A promise that resolves with the document snapshot.
 */
export const getDocument = (collectionPath: string, docId: string): Promise<DocumentSnapshot<DocumentData>> => {
  const docRef = doc(db, collectionPath, docId);
  return getDoc(docRef);
};

/**
 * Fetches a paginated list of documents from a collection.
 * @param {string} collectionPath - The path to the collection.
 * @param {number} pageSize - The number of documents to fetch per page.
 * @param {DocumentSnapshot<DocumentData> | null} [lastVisible] - The last visible document from the previous page.
 * @returns {Promise<{docs: QuerySnapshot<DocumentData>, lastVisible: DocumentSnapshot<DocumentData> | undefined}>} - A promise that resolves with the query snapshot and the last visible document.
 */
export const getPaginatedData = async (
    collectionPath: string, 
    pageSize: number = 10, 
    lastVisible: DocumentSnapshot<DocumentData> | null = null
): Promise<{ docs: QuerySnapshot<DocumentData>; lastVisible: DocumentSnapshot<DocumentData> | undefined; }> => {
    const q = query(
        collection(db, collectionPath),
        limit(pageSize),
        ...(lastVisible ? [startAfter(lastVisible)] : [])
    );
    const documentSnapshots = await getDocs(q);
    const newLastVisible = documentSnapshots.docs[documentSnapshots.docs.length-1];

    return {
        docs: documentSnapshots,
        lastVisible: newLastVisible
    };
};
