// Translates Hebrew text to English in multilingual fields ({ he, en, ... } maps) of a config
// collection, chosen with --collection (default: points):
//   points    = cfg_acupuncture_points: description, longText. Fills English only where it is
//               empty, unless --overwrite is given (then existing English is replaced too).
//   protocols = cfg_protocols: description, rationale (always translated; existing English is
//               replaced) and name (English filled only where it is empty, even with --overwrite).
// Fields without Hebrew are never touched.
//
// Two steps, so exactly what was reviewed is what gets written:
//   1. Review (default): translates and writes a report file to scratch/ (gitignored) with,
//      per point and field, the Hebrew, the current English and the proposed English.
//      Nothing is written to Firestore.
//   2. Apply: --apply --from=<report> writes the report's translations. A row is skipped if
//      the point's Hebrew or English changed since the report was made. Only <field>.en and
//      updatedAt are written; the report keeps the previous English (a restore record).
//
// --export instead of step 1: writes the same report with an empty "enNew" per row and calls no
// API, so the English can be produced elsewhere (e.g. another AI tool), then applied as in step 2.
//
// Usage (repo root):
//   node scripts/migrations/translate-points-he-to-en.js --project=dev|staging|prod [--collection=points|protocols] [--export] [--overwrite] [--limit=N] [--fields=...]
//   node scripts/migrations/translate-points-he-to-en.js --project=dev|staging|prod [--collection=points|protocols] --apply --from=scratch/<report>.json
// (--collection must match the report's; the report records it.)
//
// Translation key: cfg_secrets/main.googleTranslateApiKey of the target project (the key the
// app's translateText function uses), or the GOOGLE_TRANSLATE_API_KEY environment variable
// (e.g. for dev when the emulator data has no secrets). The Translate API is paid per character.
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Per collection: which fields, and when existing English may be replaced:
//   'flag'    = only with --overwrite;  'always' = always;  'ifEmpty' = never (fill empty only).
const COLLECTIONS = {
  points: {
    collection: 'cfg_acupuncture_points',
    fields: { description: 'flag', longText: 'flag' },
    label: (data) => data.code || '',
  },
  protocols: {
    collection: 'cfg_protocols',
    fields: { description: 'always', rationale: 'always', name: 'ifEmpty' },
    label: (data) => (typeof data.name === 'object' && data.name ? (data.name.he || data.name.en || '') : String(data.name || '')),
  },
};

const args = process.argv.slice(2);
const argValue = (name) => args.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const collectionKey = argValue('collection') || 'points';
if (!COLLECTIONS[collectionKey]) {
  console.error(`❌ Invalid --collection. Use one of: ${Object.keys(COLLECTIONS).join(', ')}.`);
  process.exit(1);
}
const CONFIG = COLLECTIONS[collectionKey];
const COLLECTION = CONFIG.collection;
const ALL_FIELDS = Object.keys(CONFIG.fields);
const project = argValue('project');
const isApply = args.includes('--apply');
const isExport = args.includes('--export');
const overwrite = args.includes('--overwrite');
const fromReport = argValue('from');
const limit = argValue('limit') ? Number(argValue('limit')) : null;
const fields = argValue('fields') ? argValue('fields').split(',') : ALL_FIELDS;

if (!['dev', 'staging', 'prod'].includes(project)) {
  console.error('❌ Invalid or missing --project. Use --project=dev, --project=staging, or --project=prod.');
  process.exit(1);
}
if (fields.some(f => !ALL_FIELDS.includes(f))) {
  console.error(`❌ --fields may only list: ${ALL_FIELDS.join(', ')}`);
  process.exit(1);
}
if (limit !== null && !(Number.isInteger(limit) && limit > 0)) {
  console.error('❌ --limit must be a positive whole number.');
  process.exit(1);
}
if (isApply && !fromReport) {
  console.error('❌ --apply needs --from=<report file> from a review run (so only reviewed translations are written).');
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
    projectId: project === 'staging' ? 'apitherapyv2' : 'apitherapy-c94a6',
  });
}
const db = app.firestore();

const text = (v) => (typeof v === 'string' ? v.trim() : '');

// ── Review: find the work, translate, write the report ─────────────────────────
async function getApiKey() {
  if (process.env.GOOGLE_TRANSLATE_API_KEY) return process.env.GOOGLE_TRANSLATE_API_KEY.trim();
  const snap = await db.collection('cfg_secrets').doc('main').get();
  const key = text(snap.data()?.googleTranslateApiKey);
  if (!key) {
    console.error(`❌ No translation key: cfg_secrets/main.googleTranslateApiKey is empty in ${project}, and GOOGLE_TRANSLATE_API_KEY is not set.`);
    process.exit(1);
  }
  return key;
}

// Google Translate v2, plain text (keeps line breaks). Requests stay well under the API's
// per-request limits: at most 100 segments and about 5,000 characters each.
async function translateAll(apiKey, texts) {
  const out = new Array(texts.length);
  let start = 0;
  while (start < texts.length) {
    let end = start;
    let chars = 0;
    while (end < texts.length && end - start < 100 && (end === start || chars + texts[end].length <= 5000)) {
      chars += texts[end].length;
      end++;
    }
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts.slice(start, end), source: 'he', target: 'en', format: 'text' }),
    });
    if (!response.ok) {
      throw new Error(`Translate API error ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    data.data.translations.forEach((t, i) => { out[start + i] = t.translatedText; });
    console.log(`   translated ${end}/${texts.length}`);
    start = end;
  }
  return out;
}

async function review() {
  const snapshot = await db.collection(COLLECTION).get();
  const counts = { docs: snapshot.size, toTranslate: 0, hasEnglish: 0, noHebrew: 0, notAMap: 0 };
  const jobs = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    for (const field of fields) {
      const value = data[field];
      if (value === undefined || value === null) { counts.noHebrew++; continue; }
      if (typeof value !== 'object') { counts.notAMap++; continue; } // old single-language string
      const he = text(value.he);
      if (!he) { counts.noHebrew++; continue; }
      const enBefore = text(value.en);
      const policy = CONFIG.fields[field];
      const mayReplace = policy === 'always' || (policy === 'flag' && overwrite);
      if (enBefore && !mayReplace) { counts.hasEnglish++; continue; }
      jobs.push({ id: doc.id, code: CONFIG.label(data), field, he, enBefore });
    }
  }
  const selected = limit ? jobs.slice(0, limit) : jobs;
  counts.toTranslate = selected.length;
  const chars = selected.reduce((n, j) => n + j.he.length, 0);

  const rules = fields.map(f => `${f} (${{ flag: overwrite ? 'replace English' : 'fill empty English', always: 'replace English', ifEmpty: 'fill empty English' }[CONFIG.fields[f]]})`);
  console.log(`\nDocuments: ${counts.docs}. Fields: ${rules.join(', ')}.`);
  console.log(`To translate: ${selected.length}${limit ? ` (of ${jobs.length}, --limit=${limit})` : ''}, ${chars} Hebrew characters.`);
  console.log(`Skipped: ${counts.hasEnglish} already have English (kept), ${counts.noHebrew} have no Hebrew, ${counts.notAMap} are an old single-language string.`);
  // Google Translate (basic) list price: USD 20 per million characters; the first 500,000
  // characters a month are covered by the free tier. Check current pricing before relying on it.
  console.log(`Estimated Translate cost: about USD ${(chars / 1e6 * 20).toFixed(2)} at list price, before the monthly free 500,000 characters.`);
  if (selected.length === 0) return;

  // --export: no translation; enNew is left empty to be filled outside (e.g. by another tool),
  // then written back with --apply --from=<this file>.
  const translations = isExport ? selected.map(() => '') : await translateAll(await getApiKey(), selected.map(j => j.he));
  const rows = selected.map((j, i) => ({ ...j, enNew: translations[i] }));

  fs.mkdirSync('scratch', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join('scratch', `translate-${collectionKey}-${project}-${isExport ? 'export-' : ''}${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ project, collection: collectionKey, createdAt: new Date().toISOString(), overwrite, fields, rows }, null, 2), 'utf8');
  const applyCommand = `node scripts/migrations/translate-points-he-to-en.js --project=${project} --collection=${collectionKey} --apply --from=${reportPath}`;
  if (isExport) {
    console.log(`\n📝 Export: ${reportPath}`);
    console.log('Fill in each row\'s "enNew" with the English translation of "he". Do not change id, field, he or enBefore');
    console.log('(they are how the apply step checks the document has not changed). Then write it back with:');
    console.log(`  ${applyCommand}`);
    return;
  }

  console.log('\nSample:');
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.code || r.id} · ${r.field}\n    he: ${r.he.slice(0, 120)}\n    en: ${r.enNew.slice(0, 120)}`);
  }
  console.log(`\n📝 Report: ${reportPath}`);
  console.log('Review it (the enNew values), then apply exactly these translations with:');
  console.log(`  ${applyCommand}`);
}

// ── Apply: write the reviewed translations ────────────────────────────────────
async function apply() {
  const report = JSON.parse(fs.readFileSync(fromReport, 'utf8'));
  if (report.project !== project) {
    console.error(`❌ The report was made for ${report.project}, not ${project}. Make a review report on ${project} first.`);
    process.exit(1);
  }
  // Reports made before --collection existed are points reports.
  const reportCollection = report.collection || 'points';
  if (reportCollection !== collectionKey) {
    console.error(`❌ The report is for --collection=${reportCollection}, not ${collectionKey}. Re-run with --collection=${reportCollection}.`);
    process.exit(1);
  }
  let written = 0;
  let skipped = 0;
  let batch = db.batch();
  let inBatch = 0;
  let empty = 0;
  for (const row of report.rows) {
    if (!text(row.enNew)) { empty++; continue; } // not translated (e.g. an export row left blank)
    const snap = await db.collection(COLLECTION).doc(row.id).get();
    const value = snap.exists ? snap.data()[row.field] : undefined;
    const heNow = text(value?.he);
    const enNow = text(value?.en);
    if (!snap.exists || heNow !== row.he || enNow !== row.enBefore) {
      console.warn(`  ⏭  ${row.code || row.id} · ${row.field}: changed since the report, skipped`);
      skipped++;
      continue;
    }
    batch.update(snap.ref, {
      [`${row.field}.en`]: text(row.enNew),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    written++;
    if (++inBatch === 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
  }
  if (inBatch > 0) await batch.commit();
  console.log(`\n✅ Written: ${written}. Skipped (changed since the report): ${skipped}. Skipped (no English in the file): ${empty}.`);
  console.log(`The previous English values are in ${fromReport} (enBefore), if a restore is ever needed.`);
}

(isApply ? apply() : review())
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Failed:', err.message || err);
    process.exit(1);
  });
