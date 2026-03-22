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

const computeAge = (birthDateStr) => {
    if (!birthDateStr) return '';
    const birthDate = new Date(birthDateStr);
    const today = new Date();
    let calculatedAge = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
    }
    return calculatedAge >= 0 ? calculatedAge.toString() : '';
};

async function migrate() {
    console.log("Starting migration: Updating patient ages...");

    const patientSnap = await db.collection('patients').get();
    console.log(`Found ${patientSnap.size} patients.`);

    const batch = db.batch();
    let count = 0;

    for (const doc of patientSnap.docs) {
        const data = doc.data();
        if (data.birthDate) {
            const age = computeAge(data.birthDate);
            batch.update(doc.ref, {
                age: age,
                updatedTimestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            count++;
        }

        // Commit in batches of 500
        if (count > 0 && count % 500 === 0) {
            await batch.commit();
            console.log(`Updated ${count} patients...`);
        }
    }

    if (count % 500 !== 0) {
        await batch.commit();
    }

    console.log(`Migration complete. Updated ${count} patients.`);
    process.exit(0);
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
