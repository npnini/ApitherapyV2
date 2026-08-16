import admin from 'firebase-admin';

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const app = admin.initializeApp({
  projectId: 'apitherapyv2'
});

const db = app.firestore();

const COLLECTIONS = [
  "cfg_acupuncture_points",
  "cfg_protocols",
  "cfg_measures",
  "cfg_problems",
  "cfg_app_config",
  "patient_medical_data",
  "treatments"
];

async function check() {
  console.log('🔍 Scanning local emulator for unmigrated URLs...');
  
  for (const col of COLLECTIONS) {
    const snap = await db.collection(col).get();
    let foundCount = 0;
    
    snap.docs.forEach(doc => {
      const data = doc.data();
      const str = JSON.stringify(data);
      if (str.includes('firebasestorage.googleapis.com')) {
        foundCount++;
        // Print the first few matches for detail
        if (foundCount <= 3) {
            console.log(`\n📍 Found URL in ${col}/${doc.id}:`);
            // Deep search for the field
            findUrls(data, '');
        }
      }
    });
    
    if (foundCount > 0) {
        console.log(`\n⚠️ Total documents with URLs in ${col}: ${foundCount}`);
    } else {
        // console.log(`✅ ${col} is clean.`);
    }
  }
  process.exit(0);
}

function findUrls(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const key in obj) {
        const value = obj[key];
        const currentPath = path ? `${path}.${key}` : key;
        if (typeof value === 'string' && value.includes('firebasestorage.googleapis.com')) {
            console.log(`   - ${currentPath}: ${value}`);
        } else if (typeof value === 'object') {
            findUrls(value, currentPath);
        }
    }
}

check();
