// Moves every point document into a language folder:
//   Points/<pointId>/<timestamp>_<name>.pdf   ->   Points/<pointId>/<lang>/<timestamp>_<name>.pdf
// (also files that were uploaded under Points/new/). <lang> is the key of the point's
// documentUrl map ({ he: "...", en: "..." }). An old single-string documentUrl has no language:
// it is treated as --legacy-lang (default "he": all existing point documents are Hebrew).
//
// This is Part B of docs/Future/Entity-Documents-Cleanup-Plan.md, for points only. By default it
// NEVER deletes a file that is not a document it has just moved: unreferenced files are only listed.
// A file counts as referenced when a point's documentUrl (any language) or imageURL uses it.
//
// Folders: Storage has no real folders; an "empty folder" in the console is a placeholder object
// whose name ends in "/" (created by hand with "Create folder"). The report always lists such empty
// folders and the top-level Points/<name>/ folders that are not a point id (e.g. BL15, DU14, LU6).
// --delete-empty-folders removes the empty placeholders (never "Points/" itself).
//
// Optional --delete-unreferenced (on production a real run also needs --confirm-prod-delete): also deletes the files under Points/ that no
// point references. Dry run first (it lists what it would delete). Safeguards: only Points/, never
// folder placeholders, only files older than --min-age-days (default 7; 0 = no age limit), and
// nothing is deleted when the run met errors, conflicts, verify failures, changes meanwhile or
// unreadable documentUrl values.
//
// Per file, in this order (a reference is never left pointing at a missing file):
//   1. copy to the new path (metadata copied, size/md5/contentType verified)
//   2. update Firestore documentUrl.<lang> to the new path, in a transaction that writes only
//      if the value is still the old one (an admin edit made meanwhile is never overwritten)
//   3. delete the original
//
// Never moved, only reported: a path used by more than one point/language, a missing file
// (broken reference), a path outside Points/, an external URL, a target that already exists with
// different content. Idempotent: a second run finds nothing to do.
//
// Usage (run from the repo root):
//   node scripts/migrations/reorganize-point-documents.js --project=dev|staging|prod [--apply] [--limit=N] [--legacy-lang=he]
//   node scripts/migrations/reorganize-point-documents.js --project=dev --delete-unreferenced [--min-age-days=7] [--apply]
//   node scripts/migrations/reorganize-point-documents.js --project=dev|staging --delete-empty-folders [--apply]
//
// Dry run is the default and changes nothing. --limit=N handles only the first N points
// that need a move (a small first test). Report: scratch/reorganize-point-documents/ (gitignored).
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
const limitArg = argValue('limit');
const legacyLang = argValue('legacy-lang') || 'he';
const deleteUnreferenced = args.includes('--delete-unreferenced');
const deleteEmptyFolders = args.includes('--delete-empty-folders');
const minAgeArg = argValue('min-age-days');
const minAgeDays = minAgeArg === null ? 7 : Number(minAgeArg);
const LANG_PATTERN = /^[a-z]{2,3}$/; // keys are used in Storage paths: letters only

if (!['dev', 'staging', 'prod'].includes(project)) {
  console.error('❌ Invalid or missing --project. Use --project=dev, --project=staging, or --project=prod.');
  process.exit(1);
}
if (!LANG_PATTERN.test(legacyLang)) {
  console.error(`❌ Invalid --legacy-lang "${legacyLang}". Use a language code such as he or en.`);
  process.exit(1);
}
const limit = limitArg === null ? Infinity : Number(limitArg);
if (!(limit > 0)) {
  console.error('❌ --limit must be a positive number.');
  process.exit(1);
}
if (!(minAgeDays >= 0)) {
  console.error('❌ --min-age-days must be 0 or more.');
  process.exit(1);
}
if ((deleteUnreferenced || deleteEmptyFolders) && project === 'prod' && isApply && !args.includes('--confirm-prod-delete')) {
  // Production deletes cannot be undone: a real run needs this extra flag, after a dry run was reviewed.
  console.error('❌ Deleting files or folders on production needs the extra flag --confirm-prod-delete (with --apply). Run the dry run first and review its list.');
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

// ---------- helpers ----------
/**
 * Plain Storage path from a stored value: a plain path, an old download URL
 * (https://…/o/<encoded path>?…) or gs://<bucket>/<path>. Returns
 * { path } or { external: true } (a non-Storage URL, e.g. Google Drive) or { invalid: true }.
 */
function normalisePath(value) {
  if (typeof value !== 'string' || !value.trim()) return { invalid: true };
  const v = value.trim();
  if (v.startsWith('gs://')) {
    const rest = v.slice('gs://'.length);
    const slash = rest.indexOf('/');
    return slash > 0 ? { path: rest.slice(slash + 1) } : { invalid: true };
  }
  if (v.startsWith('http')) {
    const match = v.match(/\/o\/([^?]+)/);
    if (!match) return { external: true };
    try {
      return { path: decodeURIComponent(match[1]) };
    } catch {
      return { invalid: true };
    }
  }
  return { path: v };
}

/** Same checks as version-upgrade.js: the copy must be identical to the original. */
function compareMeta(src, dst) {
  const problems = [];
  if (String(src.size) !== String(dst.size)) problems.push(`size ${src.size} vs ${dst.size}`);
  if (src.md5Hash && dst.md5Hash && src.md5Hash !== dst.md5Hash) problems.push('md5Hash differs');
  if ((src.contentType || '') !== (dst.contentType || '')) problems.push(`contentType "${src.contentType}" vs "${dst.contentType}"`);
  return problems;
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function writeReport(report) {
  const dir = path.resolve(process.cwd(), 'scratch/reorganize-point-documents');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `reorganize-point-documents-${project}-${stamp(runTime)}${isApply ? '' : '-dryrun'}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  return file;
}

/** Points the stored value at newPath, only if it is still oldValue (transaction). */
async function repoint(ref, lang, oldValue, wasString, newPath) {
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return 'point-deleted';
    const current = snap.get('documentUrl');
    if (wasString) {
      if (current !== oldValue) return 'changed';
      t.update(ref, { documentUrl: { [lang]: newPath } });
    } else {
      if (!current || typeof current !== 'object' || current[lang] !== oldValue) return 'changed';
      t.update(ref, new admin.firestore.FieldPath('documentUrl', lang), newPath);
    }
    return 'updated';
  });
}

// ---------- main ----------
async function main() {
  console.log(`\n--- Reorganize point documents -> Points/<id>/<lang>/ ---`);
  console.log(`Project: ${project} (${target.projectId}), bucket: ${target.bucket}`);
  console.log(`Mode: ${isApply ? 'APPLY (changes data)' : 'DRY RUN (changes nothing)'}${limit === Infinity ? '' : `, limit ${limit} point(s)`}`);
  console.log(`Old single-string documentUrl values are treated as language "${legacyLang}".`);
  if (deleteEmptyFolders) console.log(`Empty folders under Points/ will ${isApply ? 'be DELETED' : 'be listed as "would delete"'}.`);
  if (deleteUnreferenced) console.log(`Unreferenced files under Points/ will ${isApply ? 'be DELETED' : 'be listed as "would delete"'} (only files older than ${minAgeDays} day(s)).`);
  console.log('');

  // 1. Every point and its document references
  const pointsSnap = await db.collection('cfg_acupuncture_points').get();
  const entries = []; // one per (point, language) document reference
  const problems = { external: [], invalid: [], outsidePoints: [], badLanguageKey: [] };
  const imageReferences = []; // point images (imageURL): only counted as "referenced", never moved
  const extraReferencedPaths = new Set(); // paths of values the move cannot handle, still "referenced"
  let pointsWithDocuments = 0;

  for (const doc of pointsSnap.docs.sort((a, b) => a.id.localeCompare(b.id))) {
    const raw = doc.get('documentUrl');
    const pairs = []; // [lang, value, wasString]
    if (typeof raw === 'string' && raw.trim()) {
      pairs.push([legacyLang, raw, true]);
    } else if (raw && typeof raw === 'object') {
      for (const [lang, value] of Object.entries(raw)) {
        if (typeof value !== 'string' || !value.trim()) continue;
        if (!LANG_PATTERN.test(lang)) {
          problems.badLanguageKey.push({ pointId: doc.id, key: lang, value });
          const odd = normalisePath(value);
          if (odd.path) extraReferencedPaths.add(odd.path);
          continue;
        }
        pairs.push([lang, value, false]);
      }
    }
    if (pairs.length) pointsWithDocuments++;

    // The point's image (imageURL) is loaded from Storage by the app, so its file is in use.
    const rawImage = doc.get('imageURL');
    if (typeof rawImage === 'string' && rawImage.trim()) {
      const img = normalisePath(rawImage);
      if (img.path) imageReferences.push({ pointId: doc.id, code: doc.get('code') || '', path: img.path });
    }

    for (const [lang, value, wasString] of pairs) {
      const norm = normalisePath(value);
      const base = { pointId: doc.id, code: doc.get('code') || '', lang, value, wasString };
      if (norm.external) { problems.external.push(base); continue; }
      if (norm.invalid) { problems.invalid.push(base); continue; }
      if (!norm.path.startsWith('Points/')) { problems.outsidePoints.push({ ...base, path: norm.path }); continue; }
      entries.push({ ...base, path: norm.path });
    }
  }

  // 2. A path used by more than one reference is never moved
  const usage = new Map();
  for (const e of entries) usage.set(e.path, (usage.get(e.path) || 0) + 1);

  // 3. Decide what each reference needs
  const alreadyInPlace = [];
  const toProcess = [];
  const shared = [];
  const broken = [];
  const conflicts = [];

  for (const e of entries) {
    const targetPath = `Points/${e.pointId}/${e.lang}/${path.posix.basename(e.path)}`;
    const entry = { ...e, targetPath, fromNewFolder: e.path.startsWith('Points/new/') };
    if (usage.get(e.path) > 1) { shared.push(entry); continue; }

    const [exists] = await bucket.file(e.path).exists();
    if (!exists) {
      // A previous run may have copied the file and been stopped before updating Firestore.
      if (e.path !== targetPath) {
        const [targetExists] = await bucket.file(targetPath).exists();
        if (targetExists) { toProcess.push({ ...entry, sourceMissingTargetExists: true }); continue; }
      }
      broken.push(entry);
      continue;
    }
    if (e.path === targetPath && e.value === targetPath) { alreadyInPlace.push(entry); continue; }
    toProcess.push(entry); // moves the file, and/or rewrites an old URL form to a plain path
  }

  // 4. Unreferenced files (reported only, never deleted here)
  const [allFiles] = await bucket.getFiles({ prefix: 'Points/' });
  const referenced = new Set();
  for (const e of entries) {
    referenced.add(e.path);
    referenced.add(`Points/${e.pointId}/${e.lang}/${path.posix.basename(e.path)}`);
  }
  for (const img of imageReferences) referenced.add(img.path);
  for (const p of extraReferencedPaths) referenced.add(p);
  const unreferenced = allFiles
    .filter(f => !f.name.endsWith('/') && !referenced.has(f.name))
    .map(f => ({ path: f.name, size: Number(f.metadata.size || 0), created: f.metadata.timeCreated || null }));

  // 5. Do it (or describe it)
  const moved = [];
  const normalisedOnly = [];
  const verifyFailures = [];
  const changedMeanwhile = [];
  const errors = [];
  const limitedPoints = new Set();

  for (const e of toProcess) {
    if (limit !== Infinity && !limitedPoints.has(e.pointId) && limitedPoints.size >= limit) continue;
    limitedPoints.add(e.pointId);

    const fileMovesNeeded = e.path !== e.targetPath;
    const label = `${e.code || e.pointId} [${e.lang}]: ${e.path}${fileMovesNeeded ? ` -> ${e.targetPath}` : ' (stored as URL -> plain path)'}`;

    if (!isApply) {
      console.log(`   👉 Would ${fileMovesNeeded ? 'move' : 'normalise'}: ${label}${e.fromNewFolder ? '  (from Points/new/)' : ''}${e.wasString ? '  (old single-string value)' : ''}`);
      (fileMovesNeeded ? moved : normalisedOnly).push(e);
      continue;
    }

    try {
      // 1. copy + verify
      if (fileMovesNeeded && !e.sourceMissingTargetExists) {
        const src = bucket.file(e.path);
        const dest = bucket.file(e.targetPath);
        const [srcMeta] = await src.getMetadata();
        const [destExists] = await dest.exists();
        if (!destExists) {
          await src.copy(dest);
          await dest.setMetadata({
            contentType: srcMeta.contentType,
            contentDisposition: srcMeta.contentDisposition,
            cacheControl: srcMeta.cacheControl,
            contentEncoding: srcMeta.contentEncoding,
            contentLanguage: srcMeta.contentLanguage,
            metadata: srcMeta.metadata || {},
          });
        }
        const [dstMeta] = await dest.getMetadata();
        const diffs = compareMeta(srcMeta, dstMeta);
        if (diffs.length) {
          // An existing target with other content is never overwritten; a bad fresh copy is removed.
          if (destExists) conflicts.push({ ...e, problems: diffs });
          else {
            verifyFailures.push({ ...e, problems: diffs });
            await dest.delete({ ignoreNotFound: true });
          }
          console.log(`   ⚠️ Not moved (${diffs.join('; ')}): ${label}`);
          continue;
        }
      }

      // 2. Firestore: only if the value is still the old one
      const result = await repoint(db.collection('cfg_acupuncture_points').doc(e.pointId), e.lang, e.value, e.wasString, e.targetPath);
      if (result !== 'updated') {
        changedMeanwhile.push({ ...e, result });
        console.log(`   ⚠️ Skipped (${result}): ${label} — the copy at the new path, if any, is kept; the original is untouched`);
        continue;
      }

      // 3. delete the original (only after Firestore points at the copy)
      if (fileMovesNeeded) await bucket.file(e.path).delete({ ignoreNotFound: true });

      console.log(`   🔥 ${fileMovesNeeded ? 'Moved' : 'Normalised'}: ${label}`);
      (fileMovesNeeded ? moved : normalisedOnly).push(e);
    } catch (err) {
      errors.push({ ...e, error: err.message });
      console.log(`   ❌ Error: ${label}: ${err.message}`);
    }
  }

  // 5b. Optional: delete the files no point uses (dev only, see the header)
  const unreferencedDeleted = [];
  const unreferencedTooYoung = [];
  const deleteErrors = [];
  let deleteBlockedBy = null;
  if (deleteUnreferenced) {
    const blockers = [];
    if (errors.length) blockers.push(`${errors.length} error(s)`);
    if (conflicts.length) blockers.push(`${conflicts.length} target conflict(s)`);
    if (verifyFailures.length) blockers.push(`${verifyFailures.length} verify failure(s)`);
    if (changedMeanwhile.length) blockers.push(`${changedMeanwhile.length} value(s) changed meanwhile`);
    if (problems.invalid.length) blockers.push(`${problems.invalid.length} unreadable documentUrl value(s)`);
    if (blockers.length) {
      deleteBlockedBy = blockers.join(', ');
      console.log(`\n⚠️ Not deleting any unreferenced file: ${deleteBlockedBy}. Fix these first (see the report).`);
    } else {
      const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;
      console.log(`\nUnreferenced files under Points/ (older than ${minAgeDays} day(s)):`);
      for (const f of unreferenced) {
        // A file without a creation time is treated as too young (safer), unless the age limit is off.
        const ageMs = f.created ? runTime.getTime() - new Date(f.created).getTime() : null;
        if (minAgeMs > 0 && (ageMs === null || ageMs < minAgeMs)) { unreferencedTooYoung.push(f); continue; }
        if (!isApply) {
          console.log(`   👉 Would delete: ${f.path} (${f.size} bytes)`);
          unreferencedDeleted.push(f);
          continue;
        }
        try {
          await bucket.file(f.path).delete({ ignoreNotFound: true });
          console.log(`   🔥 Deleted: ${f.path} (${f.size} bytes)`);
          unreferencedDeleted.push(f);
        } catch (err) {
          deleteErrors.push({ ...f, error: err.message });
          console.log(`   ❌ Could not delete ${f.path}: ${err.message}`);
        }
      }
      if (unreferencedTooYoung.length) console.log(`   ℹ️ ${unreferencedTooYoung.length} file(s) newer than ${minAgeDays} day(s) were kept.`);
    }
  }

  // 5c. Folders. A "folder" with no file under it is a placeholder object whose name ends in "/".
  const pointIds = new Set(pointsSnap.docs.map(d => d.id));
  const [finalFiles] = await bucket.getFiles({ prefix: 'Points/' });
  // A dry run has not changed anything yet: simulate the moves and deletions it listed.
  const goneNames = new Set(isApply ? [] : [...moved.map(e => e.path), ...unreferencedDeleted.map(f => f.path)]);
  const addedNames = isApply ? [] : moved.map(e => e.targetPath);
  const allNames = [...finalFiles.map(f => f.name), ...addedNames];
  const realNames = allNames.filter(n => !n.endsWith('/') && !goneNames.has(n));
  const emptyFolders = [...new Set(allNames.filter(n => n.endsWith('/') && n !== 'Points/'))]
    .filter(p => !realNames.some(n => n.startsWith(p)))
    .sort((a, b) => b.length - a.length); // deepest first

  // Top-level Points/<name>/ folders that are not a point id (BL15, DU14, LU6, new, ...)
  const folderNames = new Set();
  for (const n of allNames) {
    const parts = n.split('/');
    if (parts.length >= 3) folderNames.add(parts[1]);
  }
  const foldersWithoutPoint = [...folderNames]
    .filter(name => !pointIds.has(name))
    .sort()
    .map(name => ({
      folder: `Points/${name}/`,
      files: realNames.filter(n => n.startsWith(`Points/${name}/`)).length,
      placeholderOnly: !realNames.some(n => n.startsWith(`Points/${name}/`)),
    }));

  const emptyFoldersDeleted = [];
  const emptyFolderErrors = [];
  let emptyFoldersBlockedBy = null;
  if (deleteEmptyFolders) {
    const blockers = [];
    if (errors.length) blockers.push(`${errors.length} error(s)`);
    if (conflicts.length) blockers.push(`${conflicts.length} target conflict(s)`);
    if (verifyFailures.length) blockers.push(`${verifyFailures.length} verify failure(s)`);
    if (changedMeanwhile.length) blockers.push(`${changedMeanwhile.length} value(s) changed meanwhile`);
    if (problems.invalid.length) blockers.push(`${problems.invalid.length} unreadable documentUrl value(s)`);
    if (blockers.length) {
      emptyFoldersBlockedBy = blockers.join(', ');
      console.log(`\n⚠️ Not deleting empty folders: ${emptyFoldersBlockedBy}.`);
    } else {
      console.log(`\nEmpty folders (placeholder objects with no file under them): ${emptyFolders.length}`);
      for (const p of emptyFolders) {
        if (!isApply) {
          console.log(`   👉 Would delete empty folder: ${p}`);
          emptyFoldersDeleted.push(p);
          continue;
        }
        try {
          await bucket.file(p).delete({ ignoreNotFound: true });
          console.log(`   🔥 Deleted empty folder: ${p}`);
          emptyFoldersDeleted.push(p);
        } catch (err) {
          emptyFolderErrors.push({ path: p, error: err.message });
          console.log(`   ❌ Could not delete ${p}: ${err.message}`);
        }
      }
    }
  } else if (emptyFolders.length) {
    console.log(`\nℹ️ ${emptyFolders.length} empty folder(s) (placeholder objects) under Points/ — use --delete-empty-folders on dev or staging to remove them.`);
  }
  if (foldersWithoutPoint.length) {
    console.log(`\nTop-level Points/ folders that are not a point id (${foldersWithoutPoint.length}):`);
    for (const f of foldersWithoutPoint) console.log(`   ${f.folder}  ${f.placeholderOnly ? '(empty)' : `(${f.files} file(s))`}`);
  }

  // 6. Summary and report
  const counts = {
    pointsInCollection: pointsSnap.size,
    pointsWithDocuments,
    documentReferences: entries.length,
    alreadyInPlace: alreadyInPlace.length,
    [isApply ? 'moved' : 'toMove']: moved.length,
    [isApply ? 'movedFromNewFolder' : 'toMoveFromNewFolder']: moved.filter(m => m.fromNewFolder).length,
    [isApply ? 'referencesNormalisedToPlainPath' : 'referencesToNormalise']: normalisedOnly.length,
    oldSingleStringValues: entries.filter(e => e.wasString).length,
    sharedPaths: shared.length,
    brokenReferences: broken.length,
    externalUrls: problems.external.length,
    unparseableValues: problems.invalid.length,
    outsidePointsFolder: problems.outsidePoints.length,
    badLanguageKeys: problems.badLanguageKey.length,
    targetConflicts: conflicts.length,
    verifyFailures: verifyFailures.length,
    changedMeanwhile: changedMeanwhile.length,
    errors: errors.length,
    pointImagesReferenced: imageReferences.length,
    unreferencedFilesInPoints: unreferenced.length,
    emptyFolders: emptyFolders.length,
    foldersNotAPointId: foldersWithoutPoint.length,
    ...(deleteEmptyFolders ? {
      [isApply ? 'emptyFoldersDeleted' : 'emptyFoldersToDelete']: emptyFoldersDeleted.length,
      emptyFolderDeleteErrors: emptyFolderErrors.length,
    } : {}),
    ...(deleteUnreferenced ? {
      [isApply ? 'unreferencedDeleted' : 'unreferencedToDelete']: unreferencedDeleted.length,
      unreferencedKeptTooYoung: unreferencedTooYoung.length,
      unreferencedDeleteErrors: deleteErrors.length,
    } : {}),
  };

  console.log('\nSummary:');
  for (const [k, v] of Object.entries(counts)) console.log(`   ${k}: ${v}`);
  if (shared.length) console.log('\n⚠️ Shared paths (not moved, see report): ' + shared.length);
  if (broken.length) console.log('⚠️ Broken references (file missing, not changed): ' + broken.length);
  if (unreferenced.length && !deleteUnreferenced) console.log(`ℹ️ ${unreferenced.length} file(s) under Points/ are not referenced by any point's documentUrl or imageURL (listed in the report, NOT deleted; use --delete-unreferenced on dev).`);

  const file = writeReport({
    project, projectId: target.projectId, bucket: target.bucket,
    mode: isApply ? 'apply' : 'dry-run', runTime: runTime.toISOString(),
    legacyLang, limit: limit === Infinity ? null : limit,
    deleteUnreferenced, minAgeDays: deleteUnreferenced ? minAgeDays : null, deleteBlockedBy,
    counts,
    moved, referencesNormalised: normalisedOnly, alreadyInPlace,
    shared, broken, conflicts, verifyFailures, changedMeanwhile, errors,
    external: problems.external, unparseable: problems.invalid,
    outsidePoints: problems.outsidePoints, badLanguageKeys: problems.badLanguageKey,
    imageReferences,
    unreferenced, unreferencedDeleted, unreferencedTooYoung, deleteErrors,
    emptyFolders, emptyFoldersDeleted, emptyFolderErrors, emptyFoldersBlockedBy, foldersWithoutPoint,
  });
  console.log(`\n📝 Report: ${file}`);

  const failed = errors.length + verifyFailures.length + conflicts.length + deleteErrors.length + emptyFolderErrors.length
    + (deleteBlockedBy ? 1 : 0) + (emptyFoldersBlockedBy ? 1 : 0);
  if (!isApply) console.log('\nDry run only. Review the report, then run again with --apply.');
  process.exitCode = failed ? 1 : 0;
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error('❌ Failed:', err);
    process.exit(1);
  });
