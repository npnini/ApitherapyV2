import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const projectArg = args.find(a => a.startsWith('--project='));
const project = projectArg ? projectArg.split('=')[1] : (args.includes('staging') ? 'staging' : (args.includes('prod') ? 'prod' : 'emulator'));
const isDelete = args.includes('--delete');

console.log(`🔍 Environment target: ${project.toUpperCase()}`);
console.log(`🧹 Execution mode: ${isDelete ? 'LIVE PURGE (DELETION)' : 'DRY-RUN SCAN (REVIEW ONLY)'}`);

// Initialize Firebase Admin SDK based on target
let app;
if (project === 'emulator') {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  app = admin.initializeApp({
    projectId: 'apitherapyv2'
  });
} else if (project === 'staging') {
  const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`❌ Error: staging service-account.json not found at ${serviceAccountPath}`);
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'apitherapyv2'
  });
} else if (project === 'prod') {
  app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'apitherapy-c94a6'
  });
} else {
  console.error(`❌ Invalid project: ${project}. Use staging, prod, or emulator.`);
  process.exit(1);
}

const db = app.firestore();

// PII Regex patterns
const ID_REGEX = /\b\d{8,9}\b/;
const EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
const IDENTITY_PREFIX_REGEX = /identity:\s*\d+/i;

function containsPII(str) {
  if (typeof str !== 'string') return false;
  
  // Israeli ID: e.g. "123456789" or "Identity: 123456789"
  const isId = ID_REGEX.test(str) || IDENTITY_PREFIX_REGEX.test(str);
  
  // Email: e.g. "a@a.com" or "A patient with email 'a@a.com' already exists."
  // But we want to avoid matching static instructions like "beelive.admin@beelive.biz"
  const isEmail = EMAIL_REGEX.test(str);
  
  if (isId) {
    return true;
  }
  
  if (isEmail) {
    // Check if it's dynamic patient error or just static instructions.
    const isPatientError = str.toLowerCase().includes('already exists') || 
                           str.toLowerCase().includes('patient') || 
                           str.toLowerCase().includes('email \'%s\'') ||
                           str.length < 50; // Dynamic leak strings are typically short
    return isPatientError;
  }
  
  return false;
}

async function cleanTranslations() {
  const colRef = db.collection('cfg_translations');
  const snapshot = await colRef.get();
  
  if (snapshot.empty) {
    console.log('ℹ️ No documents found in cfg_translations.');
    process.exit(0);
  }
  
  const auditLog = {
    scanned_at: new Date().toISOString(),
    project: project,
    findings: []
  };

  let totalPIIFieldsCount = 0;

  for (const doc of snapshot.docs) {
    const docId = doc.id;
    const data = doc.data();
    console.log(`\n📄 Checking document: cfg_translations/${docId}`);
    
    const piiFields = [];
    const updateArgs = [];

    for (const [key, value] of Object.entries(data)) {
      if (containsPII(key) || containsPII(value)) {
        console.log(`   ⚠️ Found PII in field:`);
        console.log(`     Key  : "${key}"`);
        console.log(`     Value: "${value}"`);
        piiFields.push({ key, value });
        // Use FieldPath to handle keys containing dots literally
        updateArgs.push(new admin.firestore.FieldPath(key), admin.firestore.FieldValue.delete());
        totalPIIFieldsCount++;
      }
    }

    if (piiFields.length > 0) {
      auditLog.findings.push({
        document_id: docId,
        pii_fields: piiFields
      });

      if (isDelete) {
        console.log(`   🔥 Deleting ${piiFields.length} PII fields from document...`);
        await colRef.doc(docId).update(...updateArgs);
        console.log(`   ✅ Document updated.`);
      } else {
        console.log(`   👉 Run with --delete to remove these ${piiFields.length} fields.`);
      }
    } else {
      console.log('   ✅ Document is clean.');
    }
  }

  // Save findings to review file
  const brainDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\672d6a07-7556-4e90-806d-353299c82dff';
  if (fs.existsSync(brainDir)) {
    const reviewFilePath = path.join(brainDir, `leaked_keys_for_review_${project}.json`);
    fs.writeFileSync(reviewFilePath, JSON.stringify(auditLog, null, 2), 'utf8');
    console.log(`\n📝 Audit log saved to: ${reviewFilePath}`);
  } else {
    // Fallback to local workspace if brain directory is not accessible
    fs.writeFileSync(`leaked_keys_for_review_${project}.json`, JSON.stringify(auditLog, null, 2), 'utf8');
    console.log(`\n📝 Audit log saved to local workspace: leaked_keys_for_review_${project}.json`);
  }

  console.log(`\n✨ Scan complete. Total PII keys found: ${totalPIIFieldsCount}`);
  process.exit(0);
}

cleanTranslations().catch(err => {
  console.error('❌ Error during execution:', err);
  process.exit(1);
});
