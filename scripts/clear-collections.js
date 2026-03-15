/**
 * FIREBASE COLLECTION CLEANUP SCRIPT
 * 
 * This script will erase all documents from the following collections:
 * - treatments
 * - measured_values
 * - patients
 * - patient_medical_data
 * 
 * HOW TO RUN:
 * 1. Ensure you have a service account key JSON file.
 *    (Download from Firebase Console > Project Settings > Service Accounts)
 * 2. Save the key as 'service-account.json' in the project root.
 * 3. Run the following command in your terminal:
 *    node scripts/clear-collections.js
 * 
 * WARNING: THIS ACTION IS IRREVERSIBLE.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function clearCollections() {
    try {
        const serviceAccountPath = join(__dirname, '..', 'service-account.json');
        const serviceAccount = JSON.parse(await readFile(serviceAccountPath, 'utf8'));

        initializeApp({
            credential: cert(serviceAccount)
        });

        const db = getFirestore();
        const collections = ['treatments', 'measured_values', 'patients', 'patient_medical_data'];

        console.log('Starting cleanup...');

        for (const collectionName of collections) {
            console.log(`Clearing collection: ${collectionName}...`);
            const snapshot = await db.collection(collectionName).get();

            if (snapshot.empty) {
                console.log(`Collection ${collectionName} is already empty.`);
                continue;
            }

            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log(`Successfully cleared ${snapshot.size} documents from ${collectionName}.`);
        }

        console.log('Cleanup complete!');
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error('Error: service-account.json not found in the project root.');
            console.error('Please download your service account key from the Firebase Console.');
        } else {
            console.error('An error occurred during cleanup:', error);
        }
        process.exit(1);
    }
}

clearCollections();
