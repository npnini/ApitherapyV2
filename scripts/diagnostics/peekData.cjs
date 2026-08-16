
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function peek() {
    const pointsRef = db.collection('cfg_acupuncture_points');
    const snapshot = await pointsRef.get();

    const points = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(JSON.stringify(points, null, 2));
    process.exit(0);
}

peek().catch(console.error);
