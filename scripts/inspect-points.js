import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const app = admin.initializeApp({
  projectId: 'apitherapyv2'
});

const db = app.firestore();

async function check() {
  const snap = await db.collection('cfg_acupuncture_points').limit(20).get();
  console.log('--- Checking first 20 points ---');
  snap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`Point: ${doc.id}`);
    console.log(`   - documentUrl: ${JSON.stringify(data.documentUrl)}`);
    console.log(`   - imageURL: ${JSON.stringify(data.imageURL)}`);
  });
  process.exit(0);
}

check();
