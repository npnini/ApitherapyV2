const admin = require('firebase-admin');

process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';

admin.initializeApp({
  projectId: 'apitherapyv2',
  storageBucket: 'apitherapyv2.firebasestorage.app'
});

const bucket = admin.storage().bucket();

async function listFiles() {
  console.log('📦 Listing files in Storage Emulator...');
  const [files] = await bucket.getFiles({ prefix: 'Protocols/0PY7czj6acILp7F9V6B6/' });
  files.forEach(file => {
    console.log(`- ${file.name}`);
  });
  process.exit(0);
}

listFiles().catch(console.error);
