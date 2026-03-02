import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from project root
dotenv.config({ path: join(__dirname, '../.env.local') });

const firebaseConfig = {
    apiKey: process.env.VITE_API_KEY,
    authDomain: process.env.VITE_AUTH_DOMAIN,
    projectId: process.env.VITE_PROJECT_ID,
    storageBucket: process.env.VITE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_APP_ID,
    measurementId: process.env.VITE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrate() {
    console.log('--- Starting Problem Referential Integrity Migration ---');

    // 1. Calculate Problem References (from patient_medical_data)
    console.log('Fetching patient medical data to calculate problem references...');
    const medicalSnap = await getDocs(collection(db, 'patient_medical_data'));
    const problemRefs = {};

    medicalSnap.forEach(snap => {
        const data = snap.data();
        const treatmentPlan = data.treatment_plan || {};
        const problemIds = treatmentPlan.problemIds || [];

        // Handle both array of strings and potential legacy single problemId
        if (Array.isArray(problemIds)) {
            problemIds.forEach(id => {
                if (id) {
                    problemRefs[id] = (problemRefs[id] || 0) + 1;
                }
            });
        }

        // Check for legacy problemId field if it exists and isn't in problemIds
        if (data.problemId && !problemIds.includes(data.problemId)) {
            problemRefs[data.problemId] = (problemRefs[data.problemId] || 0) + 1;
        }
    });

    console.log('Updating cfg_problems...');
    const problemsSnap = await getDocs(collection(db, 'cfg_problems'));
    let count = 0;

    for (const d of problemsSnap.docs) {
        const docRef = doc(db, 'cfg_problems', d.id);
        const data = d.data();

        await updateDoc(docRef, {
            status: data.status || 'active',
            reference_count: problemRefs[d.id] || 0
        });
        count++;
    }

    console.log(`Updated ${count} documents in cfg_problems.`);
    console.log('--- Migration Completed Successfully ---');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
