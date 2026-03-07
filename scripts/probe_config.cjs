const admin = require('firebase-admin');
const path = require('path');

const projectId = "apitherapyv2";
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');

let adminConfig = {
    projectId: projectId
};

if (require('fs').existsSync(serviceAccountPath)) {
    console.log("Using service account from:", serviceAccountPath);
    const serviceAccount = require(serviceAccountPath);
    adminConfig.credential = admin.credential.cert(serviceAccount);
} else {
    console.log("No service account found, using default credentials.");
}

admin.initializeApp(adminConfig);

const db = admin.firestore();

async function probe() {
    console.log("--- PROBING CONFIGURATION DATA ---");

    const collections = [
        'cfg_problems',
        'cfg_protocols',
        'cfg_measures',
        'cfg_acupuncture_points',
        'cfg_questionnaires'
    ];

    for (const collName of collections) {
        console.log(`\nCollection: ${collName}`);
        const snapshot = await db.collection(collName).limit(3).get();
        if (snapshot.empty) {
            console.log("  (Empty)");
            continue;
        }
        snapshot.forEach(doc => {
            console.log(`  ID: ${doc.id}`);
            // console.log(`  Data: ${JSON.stringify(doc.data(), null, 2)}`);
        });
    }
}

probe().catch(console.error).then(() => process.exit(0));
