// M3 — converts every `treatments` document's stungPointIds/stungPointSides
// (Phase 4's legacy fields) into the new stungPoints: {left,right,single} map.
// A separate --delete-old-fields pass removes stungPointIds/stungPointSides
// once the conversion has been manually verified.
//
// Conversion rule per pointId in stungPointIds:
//   - stungPointSides[pointId] === 'L' -> {left:1, right:0, single:0}
//   - stungPointSides[pointId] === 'R' -> {left:0, right:1, single:0}
//   - otherwise, resolved via cfg_acupuncture_points.Point_Grouping -> cfg_point_groups.laterality:
//       'Paired'                                  -> {left:1, right:0, single:0}
//       'Midline-front'/'Midline-back'/'Unilateral' -> {left:0, right:0, single:1}
//   - unresolvable (point/group missing, no Point_Grouping) -> left out of stungPoints
//     and written to a punch list; that treatment document keeps its old fields
//     until the punch list is resolved and it is re-migrated.
//
// Usage:
//   node scripts/migrations/migrate-treatments-sting-counters.js --project=dev|staging|prod [--apply]
//   node scripts/migrations/migrate-treatments-sting-counters.js --project=dev|staging|prod --delete-old-fields [--apply]
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const projectArg = args.find(a => a.startsWith('--project='));
const project = projectArg ? projectArg.split('=')[1] : null;
const isApply = args.includes('--apply');
const deleteOldFields = args.includes('--delete-old-fields');

if (!['dev', 'staging', 'prod'].includes(project)) {
  console.error(`❌ Invalid or missing --project. Use --project=dev, --project=staging, or --project=prod.`);
  process.exit(1);
}

console.log(`🔍 Environment target: ${project.toUpperCase()}`);
console.log(`🧹 Mode: ${deleteOldFields ? 'DELETE OLD FIELDS' : 'CONVERT TO stungPoints'} — ${isApply ? 'LIVE WRITE (--apply)' : 'DRY-RUN (REVIEW ONLY)'}`);

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

async function loadPointLateralityMap() {
  const [pointsSnap, groupsSnap] = await Promise.all([
    db.collection('cfg_acupuncture_points').get(),
    db.collection('cfg_point_groups').get(),
  ]);

  const groupLaterality = new Map();
  groupsSnap.forEach(doc => groupLaterality.set(doc.id, doc.data().laterality));

  const pointLaterality = new Map(); // pointId -> laterality string | undefined
  pointsSnap.forEach(doc => {
    const data = doc.data();
    const laterality = data.Point_Grouping ? groupLaterality.get(data.Point_Grouping) : undefined;
    pointLaterality.set(doc.id, laterality);
  });
  return pointLaterality;
}

function computeCounts(pointId, stungPointSides, pointLaterality) {
  const side = stungPointSides ? stungPointSides[pointId] : undefined;
  if (side === 'L') return { counts: { left: 1, right: 0, single: 0 } };
  if (side === 'R') return { counts: { left: 0, right: 1, single: 0 } };

  if (!pointLaterality.has(pointId)) {
    return { counts: null, reason: 'point not found in cfg_acupuncture_points' };
  }
  const laterality = pointLaterality.get(pointId);
  if (laterality === 'Paired') return { counts: { left: 1, right: 0, single: 0 } };
  if (laterality === 'Midline-front' || laterality === 'Midline-back' || laterality === 'Unilateral') {
    return { counts: { left: 0, right: 0, single: 1 } };
  }
  return { counts: null, reason: `point has no resolvable Point_Grouping/laterality (got "${laterality}")` };
}

async function convertTreatments() {
  const pointLaterality = await loadPointLateralityMap();
  console.log(`📚 Loaded laterality for ${pointLaterality.size} points`);

  const snap = await db.collection('treatments').get();
  console.log(`📄 Loaded ${snap.size} treatment documents`);

  let migrated = 0, partial = 0, empty = 0, alreadyMigrated = 0;
  const punchList = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const hasOldFields = Array.isArray(data.stungPointIds);
    if (!hasOldFields) {
      alreadyMigrated++;
      continue; // already on the new schema (created after Phase 4 shipped) — nothing to do
    }

    const ids = data.stungPointIds;
    if (ids.length === 0) {
      console.log(`\n📌 ${doc.id}: no stung points — ${isApply ? 'writing' : 'would write'} empty stungPoints: {}`);
      if (isApply) await doc.ref.update({ stungPoints: {} });
      empty++;
      continue;
    }

    const stungPoints = {};
    const docPunch = [];
    for (const pointId of ids) {
      const result = computeCounts(pointId, data.stungPointSides, pointLaterality);
      if (result.counts === null) {
        docPunch.push({ treatmentId: doc.id, pointId, reason: result.reason });
      } else {
        stungPoints[pointId] = result.counts;
      }
    }

    const fullyResolved = docPunch.length === 0;
    console.log(`\n📌 ${doc.id}: ${ids.length} stung point id(s) -> ${Object.keys(stungPoints).length} resolved${fullyResolved ? '' : `, ${docPunch.length} UNRESOLVED (see punch list)`}`);
    console.log(`   ${isApply ? '🔥 Writing' : '👉 Would write'} stungPoints:`, stungPoints);

    if (isApply) {
      await doc.ref.update({ stungPoints });
    }

    if (fullyResolved) migrated++; else partial++;
    punchList.push(...docPunch);
  }

  console.log(`\n✨ Summary: ${migrated} fully migrated, ${partial} partially migrated (see punch list), ${empty} empty, ${alreadyMigrated} already on new schema.`);

  if (punchList.length > 0) {
    const punchListPath = path.resolve(process.cwd(), `docs/points-forklift/punch-list-M3-${project}.json`);
    fs.writeFileSync(punchListPath, JSON.stringify(punchList, null, 2), 'utf8');
    console.log(`📝 Punch list written to: ${punchListPath} (${punchList.length} unresolved point reference(s) — these treatments keep their old fields until fixed by hand and re-migrated)`);
  }

  if (!isApply) {
    console.log(`👉 Run with --apply to write these updates for real.`);
  }
}

async function deleteOldFieldsPass() {
  const snap = await db.collection('treatments').get();
  console.log(`📄 Loaded ${snap.size} treatment documents`);

  let deleted = 0, skippedPartial = 0, skippedNotMigrated = 0, alreadyClean = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const hasOldFields = data.stungPointIds !== undefined || data.stungPointSides !== undefined;
    if (!hasOldFields) {
      alreadyClean++;
      continue;
    }
    if (!data.stungPoints) {
      console.log(`\n📌 ${doc.id}: ⚠️ has old fields but no stungPoints yet — run the conversion pass first. Skipping.`);
      skippedNotMigrated++;
      continue;
    }

    const oldIds = Array.isArray(data.stungPointIds) ? data.stungPointIds : [];
    const migratedCount = Object.keys(data.stungPoints).length;
    if (migratedCount < oldIds.length) {
      console.log(`\n📌 ${doc.id}: ⚠️ partially migrated (${migratedCount}/${oldIds.length}) — keeping old fields until the punch list is resolved and re-migrated. Skipping.`);
      skippedPartial++;
      continue;
    }

    console.log(`\n📌 ${doc.id}: ${isApply ? '🔥 Deleting' : '👉 Would delete'} stungPointIds/stungPointSides`);
    deleted++;
    if (isApply) {
      await doc.ref.update({
        stungPointIds: admin.firestore.FieldValue.delete(),
        stungPointSides: admin.firestore.FieldValue.delete(),
      });
    }
  }

  console.log(`\n✨ Summary: ${deleted} ${isApply ? 'cleaned' : 'to clean'}, ${skippedPartial} partial (kept), ${skippedNotMigrated} not yet migrated (kept), ${alreadyClean} already clean.`);
  if (!isApply) {
    console.log(`👉 Run with --apply to delete these old fields for real.`);
  }
}

(async () => {
  try {
    if (deleteOldFields) {
      await deleteOldFieldsPass();
    } else {
      await convertTreatments();
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during execution:', err);
    process.exit(1);
  }
})();
