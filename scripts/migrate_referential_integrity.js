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
    console.log('--- Starting Referential Integrity Migration ---');

    // 1. Calculate Point References (from Protocols)
    console.log('Fetching protocols to calculate point references...');
    const protocolsSnap = await getDocs(collection(db, 'cfg_protocols'));
    const pointRefs = {};
    protocolsSnap.forEach(snap => {
        const data = snap.data();
        const points = data.points || [];
        points.forEach(pId => {
            pointRefs[pId] = (pointRefs[pId] || 0) + 1;
        });
    });

    // 2. Calculate Protocol and Measure References (from Problems)
    console.log('Fetching problems to calculate protocol and measure references...');
    const problemsSnap = await getDocs(collection(db, 'cfg_problems'));
    const protocolRefs = {};
    const measureRefs = {};
    problemsSnap.forEach(snap => {
        const data = snap.data();
        const pIds = data.protocolIds || [];
        const mIds = data.measureIds || [];
        pIds.forEach(id => { protocolRefs[id] = (protocolRefs[id] || 0) + 1; });
        mIds.forEach(id => { measureRefs[id] = (measureRefs[id] || 0) + 1; });
    });

    const collectionsToUpdate = [
        { name: 'cfg_acupuncture_points', refMap: pointRefs },
        { name: 'cfg_protocols', refMap: protocolRefs },
        { name: 'cfg_measures', refMap: measureRefs },
        { name: 'cfg_problems', refMap: {} } // Problems are not referenced by anything currently
    ];

    for (const col of collectionsToUpdate) {
        console.log(`Updating ${col.name}...`);
        const snap = await getDocs(collection(db, col.name));
        let count = 0;
        for (const d of snap.docs) {
            const docRef = doc(db, col.name, d.id);
            await updateDoc(docRef, {
                status: 'active',
                reference_count: col.refMap[d.id] || 0
            });
            count++;
        }
        console.log(`Updated ${count} documents in ${col.name}.`);
    }

    console.log('--- Migration Completed Successfully ---');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
