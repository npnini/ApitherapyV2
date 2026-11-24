// Imports English point documents: matches PDF files (named like "GB19 - Naokong.pdf" = point code
// + label) to points in cfg_acupuncture_points, uploads each one to
//   Points/<pointId>/en/<timestamp>_<file name>.pdf
// and sets documentUrl.en on the point. The Hebrew entry (documentUrl.he) is never touched.
//
// Two stages, like translate-points-he-to-en.js:
//   1. Review (default, changes nothing): matches the files and writes a report to scratch/.
//   2. --apply --from=<report>: uploads exactly the matches listed in that report.
//
// Matching: the code part of the file name (before " - ") is compared with each point's code and
// the aliases written in brackets ("DU2 (GV2)" matches DU2 and GV2). Letter prefixes that mean the
// same point are treated as equal (DU/GV, SJ/TW/TE, KID/KI, LIV/LR/LV). The label part is only a
// check: a point whose English label differs is flagged "labelDiffers" for you to look at.
// A file that matches no point, several points, or a point that several files match is NOT uploaded:
// it is listed in the report. Resolve those with --map=<json file>:
//   { "GB19 - Naokong.pdf": "<pointId>", "Some other file.pdf": null }   (null = ignore this file)
//
// A point that already has an English document is skipped (listed as alreadyHasEnglish);
// --replace uploads the new one and deletes the old English file after the point is updated.
//
// Usage (run from the repo root):
//   node scripts/migrations/import-point-documents.js --project=dev|staging|prod [--dir=scratch/point-docs-en/pdf] [--map=<file>] [--replace]
//   node scripts/migrations/import-point-documents.js --project=dev|staging|prod --apply --from=<report> [--limit=N]
//
// Per point, in this order (a point never refers to a missing file): upload -> update Firestore
// (transaction: only if documentUrl.en is still what the report saw) -> delete the replaced file (--replace).
// Report: scratch/import-point-documents/ (gitignored).
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// ---------- arguments ----------
const args = process.argv.slice(2);
const argValue = (name) => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};
const project = argValue('project');
const isApply = args.includes('--apply');
const replaceExisting = args.includes('--replace');
const dirArg = argValue('dir') || 'scratch/point-docs-en/pdf';
const mapArg = argValue('map');
const fromArg = argValue('from');
const limitArg = argValue('limit');

if (!['dev', 'staging', 'prod'].includes(project)) {
  console.error('❌ Invalid or missing --project. Use --project=dev, --project=staging, or --project=prod.');
  process.exit(1);
}
if (isApply && !fromArg) {
  console.error('❌ --apply needs --from=<report> (the review report you checked). Run without --apply first.');
  process.exit(1);
}
const limit = limitArg === null ? Infinity : Number(limitArg);
if (!(limit > 0)) {
  console.error('❌ --limit must be a positive number.');
  process.exit(1);
}

// ---------- connection ----------
const TARGETS = {
  dev: { projectId: 'apitherapyv2', bucket: 'apitherapyv2-staging-storage', serviceAccount: null },
  staging: { projectId: 'apitherapyv2', bucket: 'apitherapyv2-staging-storage', serviceAccount: 'service-account.json' },
  prod: { projectId: 'apitherapy-c94a6', bucket: 'apitherapy-c94a6.firebasestorage.app', serviceAccount: 'service-account-prod.json' },
};
const target = TARGETS[project];

let app;
if (project === 'dev') {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  process.env.STORAGE_EMULATOR_HOST = 'http://127.0.0.1:9199';
  app = admin.initializeApp({ projectId: target.projectId, storageBucket: target.bucket });
} else {
  const serviceAccountPath = path.resolve(process.cwd(), target.serviceAccount);
  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`❌ Error: ${target.serviceAccount} not found at ${serviceAccountPath}`);
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: target.projectId,
    storageBucket: target.bucket,
  });
}

const db = app.firestore();
const bucket = app.storage().bucket();
const runTime = new Date();
const POINTS = 'cfg_acupuncture_points';

// ---------- matching helpers ----------
// Letter prefixes that name the same meridian: the first one is the canonical form.
const PREFIX_GROUPS = [['DU', 'GV'], ['SJ', 'TW', 'TE'], ['KID', 'KI'], ['LIV', 'LR', 'LV'], ['HN', 'NH']];
const canonicalPrefix = (prefix) => {
  const group = PREFIX_GROUPS.find(g => g.includes(prefix));
  return group ? group[0] : prefix;
};

/** All code tokens in a text: "SI14(TW14)" -> ["SI14","TW14"]; "GB 19" -> ["GB19"]; "KI6" -> ["KID6"]. */
function codeTokens(text) {
  const compact = String(text || '').toUpperCase().replace(/[\s.\-_]/g, '');
  const tokens = [];
  for (const m of compact.matchAll(/([A-Z]{1,4})(\d{1,3})/g)) {
    // "EX-HN15" (extra point) is the point "HN15": drop the EX
    const prefix = m[1].length > 2 && m[1].startsWith('EX') ? m[1].slice(2) : m[1];
    tokens.push(`${canonicalPrefix(prefix)}${Number(m[2])}`);
  }
  return [...new Set(tokens)];
}

/** Text for the label check: lower case, no accents, letters and digits only. */
const labelKey = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** "GB19 - Naokong.pdf" -> { code: "GB19", label: "Naokong" } (separator: hyphen or dash with spaces). */
function parseFileName(fileName) {
  const base = fileName.replace(/\.pdf$/i, '').replace(/\s*\(\d+\)\s*$/, '').trim();
  const parts = base.split(/\s+[-–—]\s+/);
  return { code: parts[0], label: parts.slice(1).join(' ') };
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function writeReport(report) {
  const dir = path.resolve(process.cwd(), 'scratch/import-point-documents');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `import-point-documents-${project}-${stamp(runTime)}${isApply ? '' : '-review'}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

// ---------- stage 1: review ----------
async function review() {
  const dir = path.resolve(process.cwd(), dirArg);
  if (!fs.existsSync(dir)) {
    console.error(`❌ PDF folder not found: ${dir}`);
    process.exit(1);
  }
  const overrides = mapArg ? JSON.parse(fs.readFileSync(path.resolve(process.cwd(), mapArg), 'utf8')) : {};

  const allFiles = fs.readdirSync(dir).filter(n => !n.startsWith('~$')).sort();
  const pdfFiles = allFiles.filter(n => /\.pdf$/i.test(n));
  const notPdf = allFiles.filter(n => !/\.pdf$/i.test(n));

  const pointsSnap = await db.collection(POINTS).get();
  const points = pointsSnap.docs.map(d => {
    const data = d.data();
    const label = typeof data.label === 'string' ? data.label : (data.label?.en || '');
    const doc = data.documentUrl;
    return {
      id: d.id,
      code: data.code || '',
      label,
      status: data.status || '',
      tokens: codeTokens(data.code),
      existingEn: doc && typeof doc === 'object' && typeof doc.en === 'string' && doc.en.trim() ? doc.en : null,
      legacyString: typeof doc === 'string' && doc.trim() !== '',
    };
  });
  const byId = new Map(points.map(p => [p.id, p]));
  const byToken = new Map();
  for (const p of points) for (const t of p.tokens) {
    if (!byToken.has(t)) byToken.set(t, []);
    byToken.get(t).push(p);
  }

  const matched = [];
  const ambiguous = [];
  const unmatched = [];
  const ignored = [];

  for (const fileName of pdfFiles) {
    const size = fs.statSync(path.join(dir, fileName)).size;
    const { code, label } = parseFileName(fileName);
    // Normally the code comes first ("GB19 - Naokong"); a name written "label - code" is found by
    // looking at the whole name when the first part has no code.
    let tokens = codeTokens(code);
    if (!tokens.length) tokens = codeTokens(fileName.replace(/\.pdf$/i, ''));

    // Hand-made override first
    if (Object.prototype.hasOwnProperty.call(overrides, fileName)) {
      const forced = overrides[fileName];
      if (forced === null) { ignored.push({ file: fileName, reason: 'ignored in --map' }); continue; }
      // One point id, or a list of ids (the same PDF is then uploaded to each of those points)
      for (const id of Array.isArray(forced) ? forced : [forced]) {
        const p = byId.get(id);
        if (!p) { unmatched.push({ file: fileName, reason: `--map point id not found: ${id}` }); continue; }
        matched.push({ file: fileName, size, pointId: p.id, code: p.code, label: p.label, labelDiffers: false, existingEn: p.existingEn, byMap: true, legacyString: p.legacyString });
      }
      continue;
    }

    const candidates = new Map();
    for (const t of tokens) for (const p of byToken.get(t) || []) candidates.set(p.id, p);
    if (candidates.size === 0) {
      unmatched.push({ file: fileName, codeInFile: code, reason: 'no point has this code' });
    } else if (candidates.size > 1) {
      ambiguous.push({ file: fileName, codeInFile: code, candidates: [...candidates.values()].map(p => ({ pointId: p.id, code: p.code, label: p.label, status: p.status })) });
    } else {
      const p = [...candidates.values()][0];
      const a = labelKey(label), b = labelKey(p.label);
      const labelDiffers = !!a && !!b && a !== b && !a.includes(b) && !b.includes(a);
      matched.push({ file: fileName, size, pointId: p.id, code: p.code, label: p.label, labelFromFile: label, labelDiffers, existingEn: p.existingEn, legacyString: p.legacyString });
    }
  }

  // Several files for one point: none of them is uploaded
  const filesPerPoint = new Map();
  for (const m of matched) {
    if (!filesPerPoint.has(m.pointId)) filesPerPoint.set(m.pointId, []);
    filesPerPoint.get(m.pointId).push(m);
  }
  const duplicates = [];
  const ready = [];
  const alreadyHasEnglish = [];
  const legacyBlocked = [];
  for (const [pointId, list] of filesPerPoint) {
    if (list.length > 1) { duplicates.push({ pointId, code: list[0].code, files: list.map(m => m.file) }); continue; }
    const m = list[0];
    if (m.legacyString) legacyBlocked.push({ ...m, reason: 'documentUrl is an old single string: run reorganize-point-documents.js first' });
    else if (m.existingEn && !replaceExisting) alreadyHasEnglish.push(m);
    else ready.push(m);
  }

  const matchedPointIds = new Set(matched.map(m => m.pointId));
  const pointsWithoutEnglish = points
    .filter(p => !p.existingEn && !matchedPointIds.has(p.id))
    .map(p => ({ pointId: p.id, code: p.code, label: p.label, status: p.status }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const counts = {
    pointsInCollection: points.length,
    pdfFiles: pdfFiles.length,
    readyToUpload: ready.length,
    readyWithLabelDiffers: ready.filter(m => m.labelDiffers).length,
    readyReplacingEnglish: ready.filter(m => m.existingEn).length,
    alreadyHasEnglish: alreadyHasEnglish.length,
    ambiguousFiles: ambiguous.length,
    unmatchedFiles: unmatched.length,
    pointsWithSeveralFiles: duplicates.length,
    blockedOldSingleString: legacyBlocked.length,
    ignoredByMap: ignored.length,
    nonPdfFilesIgnored: notPdf.length,
    pointsWithoutAnyEnglish: pointsWithoutEnglish.length,
  };

  console.log('Summary:');
  for (const [k, v] of Object.entries(counts)) console.log(`   ${k}: ${v}`);
  const show = (title, list, fmt) => {
    if (!list.length) return;
    console.log(`\n${title} (${list.length}):`);
    list.slice(0, 40).forEach(x => console.log(`   ${fmt(x)}`));
    if (list.length > 40) console.log(`   ... and ${list.length - 40} more (see the report)`);
  };
  show('⚠️ Existing English document will be REPLACED (--replace)', ready.filter(m => m.existingEn), m => `${m.code}: ${m.existingEn}  ->  ${m.file}`);
  show('⚠️ Label differs (check these by eye)', ready.filter(m => m.labelDiffers), m => `${m.file}  ->  point ${m.code} "${m.label}"`);
  show('⚠️ Ambiguous files (not uploaded)', ambiguous, a => `${a.file}  ->  ${a.candidates.map(c => `${c.code}[${c.status}]`).join(' | ')}`);
  show('⚠️ Unmatched files (not uploaded)', unmatched, u => `${u.file}  (${u.reason})`);
  show('⚠️ Points with several files (none uploaded)', duplicates, d => `${d.code}: ${d.files.join(' | ')}`);
  show('ℹ️ Points that already have an English document (skipped)', alreadyHasEnglish, m => `${m.code}  <-  ${m.file}`);
  show('ℹ️ Points without any English document', pointsWithoutEnglish, p => `${p.code} ${p.label}${p.status ? ` [${p.status}]` : ''}`);

  const file = writeReport({
    project, projectId: target.projectId, bucket: target.bucket, stage: 'review',
    runTime: runTime.toISOString(), dir, replaceExisting, counts,
    ready, alreadyHasEnglish, ambiguous, unmatched, duplicates, legacyBlocked, ignored, notPdf, pointsWithoutEnglish,
  });
  console.log(`\n📝 Review report: ${file}`);
  console.log(`\nNext: check it, resolve ambiguous/unmatched files with --map if needed, then upload:`);
  console.log(`   node scripts/migrations/import-point-documents.js --project=${project} --apply --from=${path.relative(process.cwd(), file)}`);
}

// ---------- stage 2: apply ----------
async function apply() {
  const reportPath = path.resolve(process.cwd(), fromArg);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.project !== project) {
    console.error(`❌ The report was made for "${report.project}", but --project=${project}. Use the report of the same environment.`);
    process.exit(1);
  }
  const dir = report.dir;
  const rows = report.ready || [];
  console.log(`Applying ${Math.min(rows.length, limit)} of ${rows.length} reviewed upload(s) from ${path.basename(reportPath)}\n`);

  const uploaded = [];
  const skipped = [];
  const errors = [];

  for (const row of rows.slice(0, limit === Infinity ? rows.length : limit)) {
    const label = `${row.code} <- ${row.file}`;
    const local = path.join(dir, row.file);
    let destination = null;
    try {
      if (!fs.existsSync(local)) { skipped.push({ ...row, reason: 'file no longer exists' }); console.log(`   ⚠️ Skipped (file missing): ${label}`); continue; }
      const header = Buffer.alloc(5);
      const fd = fs.openSync(local, 'r');
      fs.readSync(fd, header, 0, 5, 0);
      fs.closeSync(fd);
      if (header.toString('latin1') !== '%PDF-') { skipped.push({ ...row, reason: 'not a PDF file' }); console.log(`   ⚠️ Skipped (not a PDF): ${label}`); continue; }

      const ref = db.collection(POINTS).doc(row.pointId);
      const before = await ref.get();
      if (!before.exists) { skipped.push({ ...row, reason: 'point no longer exists' }); console.log(`   ⚠️ Skipped (point deleted): ${label}`); continue; }

      // 1. upload (same name pattern as the admin screen: <timestamp>_<original name>)
      destination = `Points/${row.pointId}/en/${Date.now()}_${row.file}`;
      await bucket.upload(local, {
        destination,
        resumable: false,
        metadata: { contentType: 'application/pdf', contentDisposition: 'inline' },
      });

      // 2. Firestore: only if documentUrl.en is still what the review saw
      const result = await db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) return 'point-deleted';
        const current = snap.get('documentUrl');
        if (typeof current === 'string' && current.trim()) return 'old-single-string';
        const currentEn = current && typeof current === 'object' && typeof current.en === 'string' && current.en.trim() ? current.en : null;
        if (currentEn !== (row.existingEn || null)) return 'changed';
        if (current && typeof current === 'object') {
          t.update(ref, new admin.firestore.FieldPath('documentUrl', 'en'), destination, 'updatedAt', admin.firestore.FieldValue.serverTimestamp());
        } else {
          t.update(ref, { documentUrl: { en: destination }, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        return 'updated';
      });

      if (result !== 'updated') {
        await bucket.file(destination).delete({ ignoreNotFound: true }); // the point did not change: remove the upload
        skipped.push({ ...row, reason: result });
        console.log(`   ⚠️ Skipped (${result}): ${label}`);
        continue;
      }

      // 3. replaced English file (only with --replace)
      if (row.existingEn) await bucket.file(row.existingEn).delete({ ignoreNotFound: true });

      uploaded.push({ ...row, destination });
      console.log(`   🔥 Uploaded: ${label}  ->  ${destination}${row.existingEn ? '  (replaced the old English file)' : ''}`);
    } catch (err) {
      if (destination) await bucket.file(destination).delete({ ignoreNotFound: true }).catch(() => {});
      errors.push({ ...row, error: err.message });
      console.log(`   ❌ Error: ${label}: ${err.message}`);
    }
  }

  console.log(`\nSummary: uploaded ${uploaded.length}, skipped ${skipped.length}, errors ${errors.length}`);
  const file = writeReport({
    project, projectId: target.projectId, bucket: target.bucket, stage: 'apply',
    runTime: runTime.toISOString(), reviewReport: reportPath, limit: limit === Infinity ? null : limit,
    counts: { uploaded: uploaded.length, skipped: skipped.length, errors: errors.length },
    uploaded, skipped, errors,
  });
  console.log(`📝 Report: ${file}`);
  process.exitCode = errors.length ? 1 : 0;
}

// ---------- main ----------
console.log(`\n--- Import English point documents ---`);
console.log(`Project: ${project} (${target.projectId}), bucket: ${target.bucket}`);
console.log(`Stage: ${isApply ? 'APPLY (uploads and changes data)' : 'REVIEW (changes nothing)'}${replaceExisting ? ', --replace' : ''}\n`);

(isApply ? apply() : review())
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error('❌ Failed:', err);
    process.exit(1);
  });
