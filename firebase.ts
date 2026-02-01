// firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDfYd5Q2rflez7dCaPzXIkpmnXbxPrHIkE",
  authDomain: "apitherapyv2.firebaseapp.com",
  projectId: "apitherapyv2",
  storageBucket: "apitherapyv2.appspot.com",
  messagingSenderId: "362764787801",
  appId: "1:362764787801:web:1f21a3eeca3128d9109148",
  measurementId: "G-N8KWP7F555"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
