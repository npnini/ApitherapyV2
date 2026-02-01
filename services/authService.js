
// services/authService.js

// This file provides functions for user authentication and data retrieval from Firestore.
// It uses the Firebase v10+ SDK and focuses on cost-optimization by using one-time fetches and pagination.

import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut 
} from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, limit, startAfter } from "firebase/firestore";
import { auth, db } from './firebaseConfig';

// --- Authentication Functions ---

/**
 * Registers a new user with email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<UserCredential>} - A promise that resolves with the user credential.
 */
export const registerWithEmail = (email, password) => {
  return createUserWithEmailAndPassword(auth, email, password);
};

/**
 * Signs in a user with email and password.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<UserCredential>} - A promise that resolves with the user credential.
 */
export const signInWithEmail = (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

/**
 * Signs in a user with their Google account.
 * @returns {Promise<UserCredential>} - A promise that resolves with the user credential.
 */
export const signInWithGoogle = () => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

/**
 * Signs out the current user.
 * @returns {Promise<void>} - A promise that resolves when the user is signed out.
 */
export const logout = () => {
  return signOut(auth);
};

// --- Firestore Data Retrieval Functions ---

/**
 * Fetches a single document from Firestore.
 * @param {string} collectionPath - The path to the collection.
 * @param {string} docId - The ID of the document.
 * @returns {Promise<DocumentSnapshot>} - A promise that resolves with the document snapshot.
 */
export const getDocument = (collectionPath, docId) => {
  const docRef = doc(db, collectionPath, docId);
  return getDoc(docRef);
};

/**
 * Fetches a paginated list of documents from a collection.
 * @param {string} collectionPath - The path to the collection.
 * @param {number} pageSize - The number of documents to fetch per page.
 * @param {DocumentSnapshot} [lastVisible] - The last visible document from the previous page.
 * @returns {Promise<{docs: QuerySnapshot, lastVisible: DocumentSnapshot}>} - A promise that resolves with the query snapshot and the last visible document.
 */
export const getPaginatedData = async (collectionPath, pageSize = 10, lastVisible = null) => {
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
