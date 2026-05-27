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
  "cfg_secrets",
  "measured_values",
  "patient_medical_data",
  "patients",
  "questionnaire_responses",
  "treatments",
  "users",
  "feedback_sessions"
];

const PROJECT_ID = 'apitherapyv2';
const BUCKET_NAME = 'apitherapyv2-staging-storage';

async function sync() {
  console.log('🚀 Starting FULL sync from live to local...');

  // Load service account
  const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  // 1. Initialize LIVE app and fetch everything from live staging cloud
  const liveApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: PROJECT_ID,
    storageBucket: BUCKET_NAME
  }, 'live');
  const liveDb = liveApp.firestore();
  const liveBucket = liveApp.storage().bucket();
  const liveAuth = liveApp.auth();

  console.log('📥 Fetching all live staging data...');

  // A. Fetch Firestore Docs
  const liveDocs = {};
  for (const collectionId of COLLECTIONS) {
    console.log(`   Reading live collection: ${collectionId}...`);
    try {
      const snapshot = await liveDb.collection(collectionId).get();
      liveDocs[collectionId] = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    } catch (err) {
      console.warn(`   ⚠️ Could not fetch collection ${collectionId}:`, err.message);
      liveDocs[collectionId] = [];
    }
  }

  // B. Fetch Auth Users
  console.log('   Reading live Auth users...');
  let liveUsers = [];
  try {
    const usersResult = await liveAuth.listUsers(1000);
    liveUsers = usersResult.users;
    console.log(`   Found ${liveUsers.length} users in live auth.`);
  } catch (err) {
    console.warn('⚠️ Could not fetch live auth users:', err.message);
  }

  // C. Download Storage Files
  console.log('   Downloading live Storage files...');
  const liveFiles = [];
  try {
    const [files] = await liveBucket.getFiles();
    console.log(`   Found ${files.length} files in live staging bucket.`);
    for (const file of files) {
      console.log(`     Downloading: ${file.name}`);
      const [content] = await file.download();
      liveFiles.push({
        name: file.name,
        content,
        contentType: file.metadata.contentType,
        customMetadata: file.metadata.metadata
      });
    }
  } catch (err) {
    console.warn('⚠️ Could not fetch live storage files:', err.message);
  }

  // 2. Set environment variables for emulators
  console.log('\n🔌 Connecting to local emulators...');
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

  // 3. Initialize LOCAL app (connected to emulators)
  const localApp = admin.initializeApp({
    projectId: PROJECT_ID,
    storageBucket: BUCKET_NAME
  }, 'local');
  const localDb = localApp.firestore();
  const localBucket = localApp.storage().bucket();
  const localAuth = localApp.auth();

  // 4. Write to LOCAL emulators
  // --- SYNC FIRESTORE ---
  console.log('\n--- 🔥 Syncing Firestore ---');
  for (const collectionId of COLLECTIONS) {
    const docs = liveDocs[collectionId];
    if (!docs || docs.length === 0) {
      console.log(`📂 Collection: ${collectionId} (empty/skipped)`);
      continue;
    }

    const batch = localDb.batch();
    docs.forEach(doc => {
      batch.set(localDb.collection(collectionId).doc(doc.id), doc.data);
    });

    await batch.commit();
    console.log(`   ✅ Copied ${docs.length} documents to collection: ${collectionId}.`);
  }

  // --- SYNC STORAGE ---
  console.log('\n--- 📦 Syncing Storage ---');
  if (liveFiles.length > 0) {
    for (const file of liveFiles) {
      console.log(`   📄 Syncing: ${file.name}`);
      const localFile = localBucket.file(file.name);
      await localFile.save(file.content, {
        metadata: {
          contentType: file.contentType,
          metadata: file.customMetadata
        }
      });
    }
    console.log('✅ Storage sync completed.');
  } else {
    console.log('   (no storage files copied)');
  }

  // --- SYNC AUTH ---
  console.log('\n--- 🔑 Syncing Authentication ---');
  if (liveUsers.length > 0) {
    // Import users to local emulator
    await localAuth.importUsers(liveUsers.map(u => ({
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
    console.log(`✅ Auth sync completed (Copied ${liveUsers.length} users).`);
  } else {
    console.log('   (no users copied)');
  }

  console.log('\n✨ FULL sync completed successfully!');
  process.exit(0);
}

sync().catch(err => {
  console.error('\n❌ Sync failed:', err);
  process.exit(1);
});
