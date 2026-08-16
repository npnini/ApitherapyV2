const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// FORCE LOCAL EMULATOR
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const PROJECT_ID = 'apitherapyv2';

admin.initializeApp({
  projectId: PROJECT_ID
});

const db = getFirestore();

const COLLECTIONS = [
  "cfg_acupuncture_points",
  "cfg_app_config",
  "cfg_measures",
  "cfg_problems",
  "cfg_protocols",
  "cfg_questionnaires",
  "cfg_translations",
  "measured_values",
  "patient_medical_data",
  "patients",
  "questionnaire_responses",
  "treatments",
  "feedback_sessions"
];

function extractPathFromUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('firebasestorage.googleapis.com')) return url;

  try {
    const decodedUrl = decodeURIComponent(url);
    // Handle both /o/path and /o/path?alt=media
    const pathPart = decodedUrl.split('/o/')[1].split('?')[0];
    return pathPart;
  } catch (err) {
    return url;
  }
}

/**
 * Recursively migrates any string that looks like a Firebase Storage URL
 */
function migrateDeep(obj) {
  if (!obj || typeof obj !== 'object') return { value: obj, updated: false };

  let updated = false;
  const newObj = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    const value = obj[key];
    
    if (typeof value === 'string' && value.includes('firebasestorage.googleapis.com')) {
      const newPath = extractPathFromUrl(value);
      if (newPath !== value) {
        newObj[key] = newPath;
        updated = true;
      } else {
        newObj[key] = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      const result = migrateDeep(value);
      newObj[key] = result.value;
      if (result.updated) updated = true;
    } else {
      newObj[key] = value;
    }
  }

  return { value: newObj, updated };
}

async function run() {
  console.log('🚀 Starting Deep Migration on Local Emulator...');
  
  for (const colId of COLLECTIONS) {
    const snapshot = await db.collection(colId).get();
    let count = 0;
    
    for (const doc of snapshot.docs) {
      const result = migrateDeep(doc.data());
      if (result.updated) {
        await doc.ref.update(result.value);
        count++;
      }
    }
    
    if (count > 0) {
      console.log(`✅ ${colId}: Migrated ${count} documents.`);
    }
  }

  console.log('\n✨ Migration finished!');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
