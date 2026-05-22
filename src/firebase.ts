// 1. Change the import: Remove getFirestore, add initializeFirestore
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider, CustomProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// 2. Replace 'export const db = getFirestore(app);' with this:
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const functions = getFunctions(app, "me-west1");

import { logger } from "./utils/logger";

// Connect to emulators in development mode
if (import.meta.env.DEV) {
  const useStagingStorage = import.meta.env.VITE_USE_STAGING_STORAGE === "true";

  if (useStagingStorage) {
    logger.warn(
      "⚠️  VITE_USE_STAGING_STORAGE=true — ALL emulators are BYPASSED. " +
      `App is running fully against staging (project: ${import.meta.env.VITE_PROJECT_ID}, ` +
      `bucket: ${import.meta.env.VITE_STORAGE_BUCKET}).`
    );
  } else {
    logger.log("Connecting to Firebase Emulators (all services)...");
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }

  // Expose to window for manual debugging/testing of security rules in browser console
  (window as any).db = db;
  (window as any).testRulesWrite = async (collectionName: string, documentId: string, data = { test: true }) => {
    const { doc, setDoc } = await import('firebase/firestore');
    try {
      await setDoc(doc(db, collectionName, documentId), data, { merge: true });
      console.log(`%cWrite to ${collectionName}/${documentId} SUCCEEDED!`, 'color: green; font-weight: bold;');
    } catch (error) {
      console.error(`%cWrite to ${collectionName}/${documentId} FAILED:`, 'color: red; font-weight: bold;', error);
    }
  };
}


// App Check Initialization (Updated)
const appCheckSiteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY;
if (appCheckSiteKey) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN || true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}