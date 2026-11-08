// Acupuncture point labels are never translated. This script, for one environment:
//   A. cfg_acupuncture_points: where label.en is empty, sets label.en to label.he. Nothing is
//      translated. With --strip-other-labels, it also removes every other language from the label
//      (label becomes { en } only). Without the flag, other languages are left as they are.
//   B. cfg_translations (the UI translation cache, docs ui_he, ui_ar, ...): deletes every entry
//      that is a point name, i.e. whose key (trimmed) starts with "<code> - " for a code that
//      exists in cfg_acupuncture_points of the SAME environment. Other entries are never touched.
//
// Two steps, so exactly what was reviewed is what gets written:
//   1. Review (default): writes a report to scratch/ (gitignored) listing every label change and
//      every translation entry to delete (key and current value). Nothing is written to Firestore.
//   2. Apply: --apply --from=<report> performs exactly the report's changes. A label row is skipped
//      if the point's label changed since the report; a translation entry is skipped if its value
//      changed or it is already gone. The report keeps the old values (a restore record).
//
// Usage (repo root):
//   node scripts/migrations/clean-point-translations.js --project=dev|staging|prod [--strip-other-labels]
//   node scripts/migrations/clean-point-translations.js --project=dev|staging|prod --apply --from=scratch/<report>.json
// (--strip-other-labels is chosen at review time; the report records it.)
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const STAGING_PROJECT_ID = 'apitherapyv2';
const PROD_PROJECT_ID = 'apitherapy-c94a6';
const POINTS = 'cfg_acupuncture_points';
const TRANSLATIONS = 'cfg_translations';

const args = process.argv.slice(2);
const argValue = (name) => args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const project = argValue('project');
const isApply = args.includes('--apply');
const fromReport = argValue('from');
const stripOther = args.includes('--strip-other-labels');

if (!['dev', 'staging', 'prod'].includes(project)) {
  console.error('❌ Invalid or missing --project. Use --project=dev, --project=staging, or --project=prod.');
  process.exit(1);
}
if (isApply && !fromReport) {
  console.error('❌ --apply needs --from=<report file> from a review run (so only reviewed changes are written).');
  process.exit(1);
}
if (isApply && stripOther) {
  console.error('❌ --strip-other-labels is chosen at review time, not with --apply.');
  process.exit(1);
}

console.log(`🔍 Environment target: ${project.toUpperCase()} · ${POINTS} + ${TRANSLATIONS}`);
console.log(`🧹 Execution mode: ${isApply ? `LIVE WRITE (--apply, from ${fromReport})` : 'REVIEW ONLY (no Firestore writes)'}`);

let app;
if (project === 'dev') {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  app = admin.initializeApp({ projectId: 'apitherapyv2' });
} else {
  const file = project === 'staging' ? 'service-account.json' : 'service-account-prod.json';
  const serviceAccountPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`❌ Error: ${project} ${file} not found at ${serviceAccountPath}`);
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: project === 'staging' ? STAGING_PROJECT_ID : PROD_PROJECT_ID,
  });
}
const db = app.firestore();

const text = (v) => (typeof v === 'string' ? v.trim() : '');

async function review() {
  const pointsSnap = await db.collection(POINTS).get();
  if (pointsSnap.empty) {
    console.error(`❌ No points found in ${POINTS} of ${project}; refusing to continue (point codes are needed).`);
    process.exit(1);
  }

  // A. Labels
  const labelRows = [];
  const codes = new Set();
  for (const doc of pointsSnap.docs) {
    const data = doc.data();
    const code = text(data.code);
    if (code) codes.add(code);
    const label = data.label;
    if (typeof label !== 'object' || label === null) {
      console.warn(`⚠️  ${code || doc.id}: label is not a language map, skipped.`);
      continue;
    }
    const en = text(label.en);
    const he = text(label.he);
    if (!en && !he) {
      console.warn(`⚠️  ${code || doc.id}: no English and no Hebrew label, skipped.`);
      continue;
    }
    const newEn = en || he;
    const labelNew = stripOther ? { en: newEn } : { ...label, en: newEn };
    if (JSON.stringify(labelNew) === JSON.stringify(label)) continue;
    labelRows.push({ id: doc.id, code, labelOld: label, labelNew });
  }

  // B. Translation cache entries of points
  const prefixes = [...codes].map(c => `${c} - `);
  const translationRows = [];
  const trSnap = await db.collection(TRANSLATIONS).get();
  for (const doc of trSnap.docs) {
    for (const [key, value] of Object.entries(doc.data())) {
      const k = key.trim();
      if (prefixes.some(p => k.startsWith(p))) {
        translationRows.push({ docId: doc.id, key, value });
      }
    }
  }

  console.log(`📊 ${pointsSnap.size} points (${codes.size} codes): ${labelRows.length} labels to change${stripOther ? ' (other languages stripped)' : ''}.`);
  console.log(`📊 ${trSnap.size} docs in ${TRANSLATIONS}: ${translationRows.length} point entries to delete.`);

  const dir = path.resolve(process.cwd(), 'scratch');
  fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, `point-cleanup-${project}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ project, stripOther, labelRows, translationRows }, null, 2), 'utf8');
  const rel = path.relative(process.cwd(), reportPath).replace(/\\/g, '/');
  console.log(`📝 Report written: ${rel}`);
  console.log('Review it, then apply exactly these changes with:');
  console.log(`   node scripts/migrations/clean-point-translations.js --project=${project} --apply --from=${rel}`);
}

async function apply() {
  const report = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), fromReport), 'utf8'));
  if (report.project !== project) {
    console.error(`❌ The report is for ${report.project}, not ${project}.`);
    process.exit(1);
  }

  // --only=labels or --only=translations applies just that part of the report (default: both)
  const only = argValue('only');
  if (only && !['labels', 'translations'].includes(only)) {
    console.error('❌ --only must be labels or translations.');
    process.exit(1);
  }
  const doLabels = !only || only === 'labels';
  const doTranslations = !only || only === 'translations';

  let labelsWritten = 0, labelsSkipped = 0;
  for (const row of doLabels ? report.labelRows : []) {
    const ref = db.collection(POINTS).doc(row.id);
    const snap = await ref.get();
    if (!snap.exists || JSON.stringify(snap.data().label ?? null) !== JSON.stringify(row.labelOld)) {
      console.warn(`⏭️  ${row.code || row.id}: label changed since the report (or point deleted), skipped.`);
      labelsSkipped++;
      continue;
    }
    await ref.update({ label: row.labelNew, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    labelsWritten++;
  }

  let deleted = 0, entriesSkipped = 0;
  const byDoc = new Map();
  for (const row of doTranslations ? report.translationRows : []) {
    if (!byDoc.has(row.docId)) byDoc.set(row.docId, []);
    byDoc.get(row.docId).push(row);
  }
  for (const [docId, rows] of byDoc) {
    const ref = db.collection(TRANSLATIONS).doc(docId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    const updateArgs = [];
    for (const row of rows) {
      if (!(row.key in data) || data[row.key] !== row.value) { entriesSkipped++; continue; }
      // FieldPath, because keys contain spaces, dashes and possibly dots
      updateArgs.push(new admin.firestore.FieldPath(row.key), admin.firestore.FieldValue.delete());
      deleted++;
    }
    // Firestore allows many fields per update; chunk at 200 fields (400 args) to stay safe
    for (let i = 0; i < updateArgs.length; i += 400) {
      await ref.update(...updateArgs.slice(i, i + 400));
    }
  }

  console.log(`✅ Labels: ${labelsWritten} written, ${labelsSkipped} skipped. Translation entries: ${deleted} deleted, ${entriesSkipped} skipped.`);
}

(isApply ? apply() : review()).catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
