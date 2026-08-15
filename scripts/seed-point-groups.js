// M1 — seeds cfg_point_groups from docs/points-forklift/Point_Groups.csv
// Usage: node scripts/seed-point-groups.js --project=dev|staging|prod [--apply]
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const projectArg = args.find(a => a.startsWith('--project='));
const project = projectArg ? projectArg.split('=')[1] : null;
const isApply = args.includes('--apply');

if (!['dev', 'staging', 'prod'].includes(project)) {
  console.error(`❌ Invalid or missing --project. Use --project=dev, --project=staging, or --project=prod.`);
  process.exit(1);
}

console.log(`🔍 Environment target: ${project.toUpperCase()}`);
console.log(`🧹 Execution mode: ${isApply ? 'LIVE WRITE (--apply)' : 'DRY-RUN (REVIEW ONLY)'}`);

let app;
if (project === 'dev') {
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
  const serviceAccountPath = path.resolve(process.cwd(), 'service-account-prod.json');
  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`❌ Error: production service-account-prod.json not found at ${serviceAccountPath}`);
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'apitherapy-c94a6'
  });
}

const db = app.firestore();

const CSV_PATH = path.resolve(process.cwd(), 'docs/points-forklift/Point_Groups.csv');
const REQUIRED_COLUMNS = ['Code', 'Name', 'description', 'type', 'laterality', 'comment'];
const VALID_TYPES = ['meridian', 'ex-point'];
const VALID_LATERALITY = ['Paired', 'Midline-front', 'Midline-back', 'Unilateral'];

// Minimal RFC4180-style CSV parser: handles quoted fields, embedded commas,
// embedded newlines within quotes, and "" as an escaped quote.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\r') {
        // skip; \n handles the row break
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
  }
  // Final field/row (file may or may not end with a newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function loadRows() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Error: seed CSV not found at ${CSV_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const table = parseCSV(raw);
  const header = table[0].map(h => h.trim());

  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) {
      console.error(`❌ Error: CSV missing required column "${col}". Found columns: ${header.join(', ')}`);
      process.exit(1);
    }
  }

  return table.slice(1).map(cols => {
    const record = {};
    header.forEach((col, idx) => { record[col] = (cols[idx] ?? '').trim(); });
    return record;
  });
}

async function seedPointGroups() {
  const rows = loadRows();
  console.log(`📄 Loaded ${rows.length} rows from ${CSV_PATH}`);

  const existingSnapshot = await db.collection('cfg_point_groups').get();
  const existingCodes = new Set(existingSnapshot.docs.map(d => d.data().code));

  let toCreate = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;

  for (const row of rows) {
    const code = row['Code'];
    const name = row['Name'];
    const description = row['description'];
    const type = row['type'];
    const laterality = row['laterality'];
    const comment = row['comment'] || '';

    console.log(`\n📌 Row: ${code}`);

    if (!code || !name || !description || !type || !laterality) {
      console.log(`   ⚠️ Skipping — missing required field(s).`);
      skippedInvalid++;
      continue;
    }
    if (!VALID_TYPES.includes(type)) {
      console.log(`   ⚠️ Skipping — invalid type "${type}" (expected one of: ${VALID_TYPES.join(', ')}).`);
      skippedInvalid++;
      continue;
    }
    if (!VALID_LATERALITY.includes(laterality)) {
      console.log(`   ⚠️ Skipping — invalid laterality "${laterality}" (expected one of: ${VALID_LATERALITY.join(', ')}).`);
      skippedInvalid++;
      continue;
    }
    if (existingCodes.has(code)) {
      console.log(`   ℹ️ Already exists in cfg_point_groups — skipping.`);
      skippedExisting++;
      continue;
    }

    const docData = {
      code,
      name,
      description,
      type,
      laterality,
      comment,
      status: 'active',
      reference_count: 0,
    };

    console.log(`   ${isApply ? '🔥 Creating' : '👉 Would create'} document:`, docData);
    toCreate++;

    if (isApply) {
      await db.collection('cfg_point_groups').add({
        ...docData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  console.log(`\n✨ Summary: ${toCreate} ${isApply ? 'created' : 'to create'}, ${skippedExisting} already existed, ${skippedInvalid} invalid/skipped.`);
  if (!isApply && toCreate > 0) {
    console.log(`👉 Run with --apply to write these ${toCreate} documents for real.`);
  }

  process.exit(0);
}

seedPointGroups().catch(err => {
  console.error('❌ Error during execution:', err);
  process.exit(1);
});
