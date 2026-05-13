const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/**
 * SCRIPT TO FIX STORAGE METADATA (Content-Disposition: inline)
 * 
 * Usage:
 * 1. Local Emulator: node scripts/fixStorageMetadata.cjs
 * 2. Staging/Production: node scripts/fixStorageMetadata.cjs --cloud
 */

const args = process.argv.slice(2);
const isCloud = args.includes('--cloud');

const PROJECT_ID = 'apitherapyv2';
const BUCKET_NAME = `${PROJECT_ID}.firebasestorage.app`;

if (!isCloud) {
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  console.log('🔧 Running on LOCAL EMULATOR (127.0.0.1:9199)');
} else {
  console.log('☁️  Running on CLOUD (Staging/Production)');
}

async function run() {
  let app;
  if (isCloud) {
    const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
    if (!fs.existsSync(serviceAccountPath)) {
      console.error('❌ Error: service-account.json not found in project root.');
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: BUCKET_NAME
    });
  } else {
    app = admin.initializeApp({
      projectId: PROJECT_ID,
      storageBucket: BUCKET_NAME
    });
  }

  const bucket = app.storage().bucket();
  console.log(`Connecting to bucket: ${BUCKET_NAME}`);

  try {
    const [files] = await bucket.getFiles();
    console.log(`Found ${files.length} files. Starting metadata update...`);

    let updatedCount = 0;
    for (const file of files) {
      const fileName = file.name.toLowerCase();
      let contentType = null;

      // Determine content type based on extension
      if (fileName.endsWith('.pdf')) contentType = 'application/pdf';
      else if (fileName.endsWith('.png')) contentType = 'image/png';
      else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) contentType = 'image/jpeg';
      else if (fileName.endsWith('.txt')) contentType = 'text/plain; charset=utf-8';
      else if (fileName.endsWith('.md')) contentType = 'text/markdown; charset=utf-8';

      if (contentType) {
        // console.log(`   📄 Updating: ${file.name} -> ${contentType}`);
        await file.setMetadata({
          contentDisposition: 'inline',
          contentType: contentType
        });
        updatedCount++;
      }
    }

    console.log(`\n✅ Finished! Updated metadata for ${updatedCount} files.`);
  } catch (err) {
    console.error('❌ Error updating metadata:', err.message);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
