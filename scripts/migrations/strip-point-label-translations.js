// Point labels are never translated: keeps only the English label of every acupuncture point in
// cfg_acupuncture_points and removes the other languages (he, ar, ...). A point with no English label
// gets its Hebrew label as the English one (or, failing that, the first non-empty label). Nothing is
// ever translated.
//
// Two steps, so exactly what was reviewed is what gets written:
//   1. Review (default): writes a report to scratch/ (gitignored) listing, per point to change, the
//      current label map and the proposed one. Nothing is written to Firestore.
//   2. Apply: --apply --from=<report> sets label = { en } and updatedAt. A row is skipped if the
//      point's label changed since the report was made. The report keeps the previous label
//      (a restore record).
//
// Usage (repo root):
//   node scripts/migrations/strip-point-label-translations.js --project=dev|staging|prod
//   node scripts/migrations/strip-point-label-translations.js --project=dev|staging|prod --apply --from=scratch/<report>.json
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const STAGING_PROJECT_ID = 'apitherapyv2';
const PROD_PROJECT_ID = 'apitherapy-c94a6';
const COLLECTION = 'cfg_acupuncture_points';

const args = process.argv.slice(2);
const argValue = (name) => args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const project = argValue('project');
const isApply = args.includes('--apply');
const fromReport = argValue('from');

if (!['dev', 'staging', 'prod'].includes(project)) {
  console.error('❌ Invalid or missing --project. Use --project=dev, --project=staging, or --project=prod.');
  process.exit(1);
}
if (isApply && !fromReport) {
  console.error('❌ --apply needs --from=<report file> from a review run (so only reviewed changes are written).');
  process.exit(1);
}

console.log(`🔍 Environment target: ${project.toUpperCase()} · collection ${COLLECTION}`);
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

// The English label to keep: English, else Hebrew, else the first non-empty value. '' = no label at all.
function pickEnglish(label) {
  if (typeof label === 'string') return text(label);
  if (!label || typeof label !== 'object') return '';
  return text(label.en) || text(label.he) || Object.values(label).map(text).find(Boolean) || '';
}

// A point needs no change when its label is already exactly { en: <non-empty> }.
function isClean(label) {
  return !!label && typeof label === 'object' && Object.keys(label).length === 1 && text(label.en) !== '';
}

async function review() {
  const snap = await db.collection(COLLECTION).get();
  const rows = [];
  let clean = 0;
  let noLabel = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (isClean(data.label)) { clean++; continue; }
    const en = pickEnglish(data.label);
    if (!en) { noLabel++; console.warn(`⚠️  ${data.code || doc.id}: no label in any language, skipped.`); continue; }
    rows.push({ id: doc.id, code: data.code || '', labelOld: data.label ?? null, labelNew: { en } });
  }
  console.log(`📊 ${snap.size} points: ${clean} already English-only, ${rows.length} to change, ${noLabel} with no label.`);

  const dir = path.resolve(process.cwd(), 'scratch');
  fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, `point-labels-${project}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ project, collection: COLLECTION, rows }, null, 2), 'utf8');
  console.log(`📝 Report written: ${path.relative(process.cwd(), reportPath)}`);
  console.log('Review it, then apply exactly these changes with:');
  console.log(`   node scripts/migrations/strip-point-label-translations.js --project=${project} --apply --from=${path.relative(process.cwd(), reportPath).replace(/\\/g, '/')}`);
}

async function apply() {
  const report = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), fromReport), 'utf8'));
  if (report.project !== project || report.collection !== COLLECTION) {
    console.error(`❌ The report is for ${report.project}/${report.collection}, not ${project}/${COLLECTION}.`);
    process.exit(1);
  }
  let written = 0;
  let skipped = 0;
  for (const row of report.rows) {
    const ref = db.collection(COLLECTION).doc(row.id);
    const snap = await ref.get();
    if (!snap.exists || JSON.stringify(snap.data().label ?? null) !== JSON.stringify(row.labelOld)) {
      console.warn(`⏭️  ${row.code || row.id}: label changed since the report (or point deleted), skipped.`);
      skipped++;
      continue;
    }
    await ref.update({ label: row.labelNew, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    written++;
  }
  console.log(`✅ Done: ${written} written, ${skipped} skipped.`);
}

(isApply ? apply() : review()).catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
