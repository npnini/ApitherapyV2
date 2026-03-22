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

async function inspect() {
    console.log("--- Inspecting Patients (First 2) ---");
    const patientSnap = await db.collection('patients').limit(2).get();
    patientSnap.forEach(doc => {
        console.log(`ID: ${doc.id}`);
        console.log(doc.data());
    });

    console.log("\n--- Inspecting Measured Values (First 2) ---");
    const readingSnap = await db.collection('measured_values').limit(2).get();
    readingSnap.forEach(doc => {
        console.log(`ID: ${doc.id}`);
        const data = doc.data();
        console.log(data);
        if (data.readings && data.readings.length > 0) {
            console.log("First Reading Value Type:", typeof data.readings[0].value);
            console.log("First Reading:", data.readings[0]);
        }
    });

    process.exit(0);
}

inspect().catch(err => {
    console.error(err);
    process.exit(1);
});
