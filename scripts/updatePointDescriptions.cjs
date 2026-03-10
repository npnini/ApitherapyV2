
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Code mapping to match Firestore standard codes
const CODE_MAP = {
    'P': 'LU',  // Lung
    'IG': 'LI', // Large Intestine
    'E': 'ST',  // Stomach
    'VC': 'CV'  // Conception Vessel
};

async function updateDescriptions() {
    const descriptionsPath = path.join(__dirname, '..', 'point_descriptions_bilingual.json');
    const descriptions = JSON.parse(fs.readFileSync(descriptionsPath, 'utf8'));

    const pointsRef = db.collection('cfg_acupuncture_points');
    const snapshot = await pointsRef.get();

    const existingPoints = {}; // stdCode -> docId
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        existingPoints[data.code.toUpperCase()] = doc.id;
    });

    console.log(`Starting update for ${Object.keys(descriptions).length} points...`);

    let updatedCount = 0;
    let missedCount = 0;

    for (let [origCode, content] of Object.entries(descriptions)) {
        origCode = origCode.toUpperCase();

        // Translate code to standard if needed
        let prefix = origCode.match(/^[A-Z]+/)[0];
        let number = origCode.match(/[0-9]+$/)[0];
        let stdCode = (CODE_MAP[prefix] || prefix) + number;

        const docId = existingPoints[stdCode] || existingPoints[origCode];

        if (docId) {
            await pointsRef.doc(docId).update({
                description: {
                    en: content.en,
                    he: content.he
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            updatedCount++;
            console.log(`Updated: ${stdCode} (${origCode})`);
        } else {
            console.warn(`Warning: Point ${stdCode} (${origCode}) not found in Firestore.`);
            missedCount++;
        }
    }

    console.log(`\nUpdate completed!`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Missed: ${missedCount}`);
    process.exit(0);
}

updateDescriptions().catch(err => {
    console.error('Error updating descriptions:', err);
    process.exit(1);
});
