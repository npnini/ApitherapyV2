const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/**
 * FIX SCRIPT: Migrate Treatment IDs to Production Format
 * 
 * This script loops through all documents in the 'treatments' collection.
 * It recreates them with the {patientId}_{timestamp} format without
 * modifying any of their content (including measured_reading references).
 * 
 * Usage: node scripts/fix_treatment_ids.cjs
 */

const projectId = "apitherapyv2";
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');

let adminConfig = { projectId };
if (fs.existsSync(serviceAccountPath)) {
    adminConfig.credential = admin.credential.cert(require(serviceAccountPath));
}
admin.initializeApp(adminConfig);
const db = admin.firestore();

async function fixTreatmentIds() {
    console.log(">>> Starting Treatment ID Migration (Only ID Change) <<<");

    const treatmentsSnap = await db.collection('treatments').get();
    console.log(`Found ${treatmentsSnap.size} treatments.`);

    let fixedCount = 0;
    let skippedCount = 0;

    let batch = db.batch();
    let batchOps = 0;

    for (const doc of treatmentsSnap.docs) {
        const data = doc.data();
        const oldId = doc.id;
        const patientId = data.patientId;
        const ts = data.createdTimestamp;

        if (!patientId || !ts) {
            skippedCount++;
            continue;
        }

        let ms = ts.toDate ? ts.toDate().getTime() : (ts._seconds ? ts._seconds * 1000 : ts);
        const expectedId = `${patientId}_${ms}`;

        if (oldId === expectedId) {
            skippedCount++;
            continue;
        }

        console.log(`  Fixing: ${oldId} -> ${expectedId}`);
        batch.set(db.collection('treatments').doc(expectedId), { ...data, id: expectedId });
        batch.delete(db.collection('treatments').doc(oldId));

        fixedCount++;
        batchOps += 2;

        if (batchOps >= 400) {
            await batch.commit();
            batch = db.batch();
            batchOps = 0;
        }
    }

    if (batchOps > 0) {
        await batch.commit();
    }

    console.log(`\n>>> Migration Complete <<<`);
    console.log(`Fixed:   ${fixedCount}`);
    console.log(`Skipped: ${skippedCount}`);
}

fixTreatmentIds().catch(console.error);
