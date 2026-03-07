require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

const path = require('path');
const fs = require('fs');

const projectId = "apitherapyv2";
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');

let adminConfig = { projectId };
if (fs.existsSync(serviceAccountPath)) {
    adminConfig.credential = admin.credential.cert(require(serviceAccountPath));
}
admin.initializeApp(adminConfig);

const db = admin.firestore();

async function fixMeasureValues() {
    console.log("Fetching measured_values documents...");
    const snap = await db.collection('measured_values').get();
    let updatedCount = 0;

    const batches = [];
    let currentBatch = db.batch();
    let opCount = 0;

    snap.forEach(doc => {
        const data = doc.data();
        let changed = false;

        if (data.readings && Array.isArray(data.readings)) {
            data.readings.forEach(reading => {
                if (reading.type === 'Category' && reading.value && typeof reading.value === 'object') {
                    if (reading.value.en !== undefined) {
                        delete reading.value.en;
                        changed = true;
                    }
                }
            });
        }

        if (changed) {
            currentBatch.update(doc.ref, { readings: data.readings });
            opCount++;
            updatedCount++;

            if (opCount === 500) {
                batches.push(currentBatch);
                currentBatch = db.batch();
                opCount = 0;
            }
        }
    });

    if (opCount > 0) {
        batches.push(currentBatch);
    }

    console.log(`Found ${updatedCount} documents to update. Committing batches...`);
    for (const batch of batches) {
        await batch.commit();
    }
    console.log("Done!");
}

fixMeasureValues()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
