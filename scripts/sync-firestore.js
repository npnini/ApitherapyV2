import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

/**
 * FULL SYNC FROM LIVE TO LOCAL EMULATOR (Firestore + Storage)
 * 
 * Usage:
 * 1. Ensure you are logged in to firebase: `firebase login`
 * 2. Start emulators: `npm run emulators`
 * 3. Run this script: `npm run sync-data`
 */

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
  "users",
  "feedback_sessions"
];

const PROJECT_ID = 'apitherapyv2';
const BUCKET_NAME = `${PROJECT_ID}.firebasestorage.app`; // Default bucket

async function sync() {
  console.log('🚀 Starting FULL sync from live to local...');

  // Load service account
  const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  // 1. Initialize LIVE app
  const liveApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: PROJECT_ID,
    storageBucket: BUCKET_NAME
  }, 'live');
  const liveDb = liveApp.firestore();
  const liveBucket = liveApp.storage().bucket();

  // 2. Initialize LOCAL app (connected to emulators)
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
  
  const localApp = admin.initializeApp({
    projectId: PROJECT_ID,
    storageBucket: BUCKET_NAME
  }, 'local');
  const localDb = localApp.firestore();
  const localBucket = localApp.storage().bucket();

  // --- SYNC FIRESTORE ---
  console.log('\n--- 🔥 Syncing Firestore ---');
  for (const collectionId of COLLECTIONS) {
    console.log(`📂 Collection: ${collectionId}`);
    
    const snapshot = await liveDb.collection(collectionId).get();
    if (snapshot.empty) {
      console.log(`   (empty)`);
      continue;
    }

    const batch = localDb.batch();
    snapshot.docs.forEach(doc => {
      batch.set(localDb.collection(collectionId).doc(doc.id), doc.data());
    });

    await batch.commit();
    console.log(`   ✅ Copied ${snapshot.size} documents.`);
  }

  // --- SYNC STORAGE ---
  console.log('\n--- 📦 Syncing Storage ---');
  try {
    const [files] = await liveBucket.getFiles();
    console.log(`Found ${files.length} files in live bucket.`);

    for (const file of files) {
      console.log(`   📄 Syncing: ${file.name}`);
      
      // Download from live to memory buffer
      const [content] = await file.download();
      
      // Upload to local emulator
      const localFile = localBucket.file(file.name);
      await localFile.save(content, {
        metadata: {
          contentType: file.metadata.contentType,
          metadata: file.metadata.metadata // Preserve custom metadata
        }
      });
    }
    console.log('✅ Storage sync completed.');
  } catch (err) {
    console.warn('⚠️ Storage sync failed (bucket might be empty or inaccessible):', err.message);
  }

  // --- SYNC AUTH ---
  console.log('\n--- 🔑 Syncing Authentication ---');
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  
  try {
    const usersResult = await liveApp.auth().listUsers(1000);
    const users = usersResult.users;
    
    if (users.length > 0) {
      console.log(`Found ${users.length} users in live auth.`);
      
      // Import users to local emulator
      // Note: This only imports user records, not passwords. 
      // For the emulator, users can usually sign in with any password or no password depending on config,
      // but importing them preserves their UIDs which is critical for Firestore references.
      await localApp.auth().importUsers(users.map(u => ({
        uid: u.uid,
        email: u.email,
        emailVerified: u.emailVerified,
        displayName: u.displayName,
        photoURL: u.photoURL,
        phoneNumber: u.phoneNumber,
        disabled: u.disabled,
        metadata: u.metadata,
        customClaims: u.customClaims,
        providerData: u.providerData,
      })));
      
      console.log('✅ Auth sync completed.');
    } else {
      console.log('   (no users found)');
    }
  } catch (err) {
    console.warn('⚠️ Auth sync failed:', err.message);
  }

  console.log('\n✨ FULL sync completed successfully!');
  process.exit(0);
}

sync().catch(err => {
  console.error('\n❌ Sync failed:', err);
  process.exit(1);
});
