
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Replace this with your own Firebase configuration object!
const firebaseConfig = {
  apiKey: "AIzaSyAi3Y5fTBUg9EOnt6rXOxBctpe9MjqxiFo",
  authDomain: "apitherapy-c94a6.firebaseapp.com",
  projectId: "apitherapy-c94a6",
  storageBucket: "apitherapy-c94a6.firebasestorage.app",
  messagingSenderId: "77979209574",
  appId: "1:77979209574:web:f2d5a45c437672338342a7",
  measurementId: "G-R35T5PB01R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

