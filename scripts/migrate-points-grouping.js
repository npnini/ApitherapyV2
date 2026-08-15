// M2 — backfills cfg_acupuncture_points.Point_Grouping and corrects
// positions.corpo.x/y/z from docs/points-forklift/point_side_analysis_2026-08-15.csv
// (a fresh export of the PointSideAnalysis diagnostic tool's live-DB view).
// Usage: node scripts/migrate-points-grouping.js --project=dev|staging|prod [--apply]
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

const CSV_PATH = path.resolve(process.cwd(), 'docs/points-forklift/point_side_analysis_2026-08-15.csv');
const REQUIRED_COLUMNS = ['id', 'code', 'Point_Group', 'corpo_x', 'corpo_y', 'corpo_z'];
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
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function loadRows() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Error: source CSV not found at ${CSV_PATH}`);
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

// Paired -> always store on the Right side (negative x); Midline-front/back
// -> force exactly 0; Unilateral -> use the source value exactly as given.
function computeCorpoX(laterality, rawX) {
  if (laterality === 'Paired') {
    return rawX > 0 ? -rawX : rawX;
  }
  if (laterality === 'Midline-front' || laterality === 'Midline-back') {
    return 0;
  }
  // Unilateral
  return rawX;
}

async function migratePointsGrouping() {
  const rows = loadRows();
  console.log(`📄 Loaded ${rows.length} rows from ${CSV_PATH}`);

  const groupsSnapshot = await db.collection('cfg_point_groups').get();
  const groupsByCode = new Map();
  groupsSnapshot.forEach(doc => {
    const data = doc.data();
    groupsByCode.set(data.code, { id: doc.id, laterality: data.laterality });
  });
  console.log(`📚 Loaded ${groupsByCode.size} point groups from cfg_point_groups`);

  let updated = 0;
  let skipped = 0;
  const punchList = [];

  for (const row of rows) {
    const { id, code, Point_Group: groupCode } = row;
    const rawX = Number(row.corpo_x);
    const rawY = Number(row.corpo_y);
    const rawZ = Number(row.corpo_z);

    console.log(`\n📌 Row: ${code} (${id})`);

    if (!id || !code || !groupCode) {
      console.log(`   ⚠️ Skipping — missing id/code/Point_Group.`);
      punchList.push({ id, code, reason: 'missing id/code/Point_Group' });
      skipped++;
      continue;
    }
    if (Number.isNaN(rawX) || Number.isNaN(rawY) || Number.isNaN(rawZ)) {
      console.log(`   ⚠️ Skipping — non-numeric corpo_x/y/z.`);
      punchList.push({ id, code, reason: 'non-numeric corpo_x/y/z' });
      skipped++;
      continue;
    }

    const group = groupsByCode.get(groupCode);
    if (!group) {
      console.log(`   ⚠️ Skipping — Point_Group "${groupCode}" not found in cfg_point_groups.`);
      punchList.push({ id, code, reason: `Point_Group "${groupCode}" not found in cfg_point_groups` });
      skipped++;
      continue;
    }
    if (!VALID_LATERALITY.includes(group.laterality)) {
      console.log(`   ⚠️ Skipping — group "${groupCode}" has invalid laterality "${group.laterality}".`);
      punchList.push({ id, code, reason: `group "${groupCode}" has invalid laterality "${group.laterality}"` });
      skipped++;
      continue;
    }

    const pointRef = db.collection('cfg_acupuncture_points').doc(id);
    const pointSnap = await pointRef.get();
    if (!pointSnap.exists) {
      console.log(`   ⚠️ Skipping — no cfg_acupuncture_points document with id "${id}" in this environment.`);
      punchList.push({ id, code, reason: `no cfg_acupuncture_points document with id "${id}" in this environment` });
      skipped++;
      continue;
    }

    const correctedX = computeCorpoX(group.laterality, rawX);
    const update = {
      Point_Grouping: group.id,
      'positions.corpo.x': correctedX,
      'positions.corpo.y': rawY,
      'positions.corpo.z': rawZ,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    console.log(`   ${isApply ? '🔥 Updating' : '👉 Would update'} — group: ${groupCode} (${group.laterality}) -> Point_Grouping: ${group.id}, corpo.x: ${rawX} -> ${correctedX}, corpo.y: ${rawY}, corpo.z: ${rawZ}`);
    updated++;

    if (isApply) {
      await pointRef.update(update);
    }
  }

  console.log(`\n✨ Summary: ${updated} ${isApply ? 'updated' : 'to update'}, ${skipped} skipped (see punch list).`);

  if (punchList.length > 0) {
    const punchListPath = path.resolve(process.cwd(), `docs/points-forklift/punch-list-M2-${project}.json`);
    fs.writeFileSync(punchListPath, JSON.stringify(punchList, null, 2), 'utf8');
    console.log(`📝 Punch list written to: ${punchListPath}`);
  }

  if (!isApply && updated > 0) {
    console.log(`👉 Run with --apply to write these ${updated} updates for real.`);
  }

  process.exit(0);
}

migratePointsGrouping().catch(err => {
  console.error('❌ Error during execution:', err);
  process.exit(1);
});
