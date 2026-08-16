import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const app = admin.initializeApp({
  projectId: 'apitherapyv2'
});

const db = app.firestore();

async function listUsers() {
  const snapshot = await db.collection('users').get();
  console.log('--- Synced Users in Local Firestore ---');
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    console.log(`UID: ${doc.id} | Email: ${data.email} | Name: ${data.displayName || data.firstName || 'N/A'}`);
  });
  process.exit(0);
}

listUsers();
