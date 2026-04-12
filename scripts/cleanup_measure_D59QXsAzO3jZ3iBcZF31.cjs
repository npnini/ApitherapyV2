require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const projectId = "apitherapyv2";
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');

let adminConfig = { projectId };
if (fs.existsSync(serviceAccountPath)) {
    adminConfig.credential = admin.credential.cert(require(serviceAccountPath));
} else {
    console.warn("Service account file not found, attempting to use default credentials.");
}
admin.initializeApp(adminConfig);

const db = admin.firestore();
const targetId = "D59QXsAzO3jZ3iBcZF31";

async function runCleanup() {
    console.log(`Starting cleanup for measureId: ${targetId}`);

    // 1. patient_medical_data collection
    console.log("Cleaning up patient_medical_data...");
    const pmdSnap = await db.collection('patient_medical_data')
        .where('measureIds', 'array-contains', targetId)
        .get();

    console.log(`Found ${pmdSnap.size} documents in patient_medical_data to update.`);
    if (pmdSnap.size > 0) {
        let pmdBatch = db.batch();
        let pmdOpCount = 0;
        const pmdBatches = [];

        pmdSnap.forEach(doc => {
            pmdBatch.update(doc.ref, {
                measureIds: admin.firestore.FieldValue.arrayRemove(targetId)
            });
            pmdOpCount++;
            if (pmdOpCount === 500) {
                pmdBatches.push(pmdBatch.commit());
                pmdBatch = db.batch();
                pmdOpCount = 0;
            }
        });
        if (pmdOpCount > 0) pmdBatches.push(pmdBatch.commit());
        await Promise.all(pmdBatches);
    }
    console.log("patient_medical_data cleanup complete.");

    // 2. measured_values collection
    console.log("Cleaning up measured_values...");
    // We query by usedMeasureIds containing the targetId
    const mvSnap = await db.collection('measured_values')
        .where('usedMeasureIds', 'array-contains', targetId)
        .get();

    console.log(`Found ${mvSnap.size} documents in measured_values to check for updates.`);
    if (mvSnap.size > 0) {
        let mvBatch = db.batch();
        let batchCount = 0;
        const allBatches = [];

        mvSnap.forEach(doc => {
            const data = doc.data();
            let changed = false;
            const updates = {};

            // usedMeasureIds arrayRemove
            if (data.usedMeasureIds && data.usedMeasureIds.includes(targetId)) {
                updates.usedMeasureIds = admin.firestore.FieldValue.arrayRemove(targetId);
                changed = true;
            }

            // readings array filter
            if (data.readings && Array.isArray(data.readings)) {
                const newReadings = data.readings.filter(r => r.measureId !== targetId);
                if (newReadings.length !== data.readings.length) {
                    updates.readings = newReadings;
                    changed = true;
                }
            }

            if (changed) {
                mvBatch.update(doc.ref, updates);
                batchCount++;
                if (batchCount === 500) {
                    allBatches.push(mvBatch.commit());
                    mvBatch = db.batch();
                    batchCount = 0;
                }
            }
        });

        if (batchCount > 0) {
            allBatches.push(mvBatch.commit());
        }

        await Promise.all(allBatches);
    }
    console.log("measured_values cleanup complete.");
    console.log("Cleanup finished successfully.");
}

runCleanup()
    .then(() => process.exit(0))
    .catch(err => {
        console.error("Cleanup failed:", err);
        process.exit(1);
    });
