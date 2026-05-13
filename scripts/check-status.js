const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';

admin.initializeApp({
  projectId: 'apitherapyv2',
  storageBucket: 'apitherapyv2.firebasestorage.app'
});

const db = getFirestore();
const bucket = admin.storage().bucket();

const COLLECTIONS = [
  "cfg_acupuncture_points",
  "cfg_measures",
  "cfg_problems",
  "cfg_protocols"
];

async function checkCollection(colId) {
  console.log(`\n--- 📂 Checking ${colId} ---`);
  const snapshot = await db.collection(colId).get();
  
  let total = 0;
  let unmigrated = 0;
  let migrated = 0;
  let missingFiles = [];

  for (const doc of snapshot.docs) {
    total++;
    const data = doc.data();
    
    // Helper to find storage refs in data
    const findRefs = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const key in obj) {
        const val = obj[key];
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof val === 'string') {
          if (val.includes('firebasestorage.googleapis.com')) {
            unmigrated++;
            // console.log(`   [!] Unmigrated URL at ${currentPath}: ${val.substring(0, 50)}...`);
          } else if (val.startsWith('Points/') || val.startsWith('Protocols/') || val.startsWith('Measures/')) {
            migrated++;
            // Check if file exists
            checkFileExists(val, doc.id, currentPath);
          }
        } else if (typeof val === 'object') {
          findRefs(val, currentPath);
        }
      }
    };

    const checkFileExists = async (filePath, docId, fieldPath) => {
      const file = bucket.file(filePath);
      const [exists] = await file.exists();
      if (!exists) {
        missingFiles.push({ docId, fieldPath, filePath });
      }
    };

    findRefs(data);
  }

  // Wait for file checks (roughly)
  await new Promise(r => setTimeout(r, 1000));

  console.log(`   Documents: ${total}`);
  console.log(`   Migrated Paths: ${migrated}`);
  console.log(`   Unmigrated URLs: ${unmigrated}`);
  
  if (missingFiles.length > 0) {
    console.log(`   ⚠️  Missing Files in Storage (${missingFiles.length}):`);
    missingFiles.slice(0, 5).forEach(m => {
      console.log(`      - Doc ${m.docId} (${m.fieldPath}): ${m.filePath}`);
    });
    if (missingFiles.length > 5) console.log(`      ... and ${missingFiles.length - 5} more.`);
  } else {
    console.log(`   ✅ All storage paths verified in emulator.`);
  }
}

async function run() {
  for (const col of COLLECTIONS) {
    await checkCollection(col);
  }
  process.exit(0);
}

run().catch(console.error);
