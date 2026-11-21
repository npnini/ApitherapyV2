// Version-upgrade script: a registry of independent upgrade items (U1, U2, ...).
// Every item is idempotent (safe to run twice), has a dry-run mode (the default),
// and writes a summary of what it changed (console + JSON report).
//
// Items:
//   U1 (phase 1) — createdTimestamp and updatedTimestamp for all users
//   U2 (phase 1) — Storage: App_config/ split into patient_documents/ and user_documents/
//   U3 (phase 2) — plan = free for every user without a plan (roles unchanged)
//   U4 (phase 2) — cfg_app_config/userTerms with no versions and no currentVersion
//
// Usage:
//   node scripts/migrations/version-upgrade.js --project=dev|staging|prod --phase=1 [--apply]
//   node scripts/migrations/version-upgrade.js --project=dev|staging|prod --items=U1,U2 [--apply]
//
// Run it AFTER the app version is deployed (so new template uploads already go to
// App_config/patient_documents/). Run from the repo root. Reports: scratch/version-upgrade/ (gitignored).
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// ---------- arguments ----------
const args = process.argv.slice(2);
const argValue = (name) => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : null;
};
const project = argValue('project');
const phaseArg = argValue('phase');
const itemsArg = argValue('items');
const isApply = args.includes('--apply');

if (!['dev', 'staging', 'prod'].includes(project)) {
  console.error('❌ Invalid or missing --project. Use --project=dev, --project=staging, or --project=prod.');
  process.exit(1);
}
if (!phaseArg && !itemsArg) {
  console.error('❌ Give --phase=<n> or --items=U1,U2,...');
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
const auth = app.auth();
const bucket = app.storage().bucket();
const { Timestamp } = admin.firestore;
const runTime = Timestamp.now();

// ---------- helpers ----------
/** Converts a stored timestamp (Firestore Timestamp, ms number, Date, ISO string) to a Date, or null. */
function toDate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000);
  }
  return null;
}

/** Storage path from a stored value: a plain path, or an old download URL (…/o/<encoded path>?…). */
function toStoragePath(value) {
  if (typeof value !== 'string' || !value) return null;
  if (!value.startsWith('http')) return value;
  const match = value.match(/\/o\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const pad = (n) => String(n).padStart(2, '0');
function stamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function writeReport(itemId, summary) {
  // scratch/ is gitignored: reports hold user emails
  const dir = path.resolve(process.cwd(), 'scratch/version-upgrade');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `version-upgrade-${project}-${itemId}-${stamp(runTime.toDate())}${isApply ? '' : '-dryrun'}.json`);
  fs.writeFileSync(file, JSON.stringify({ project, item: itemId, mode: isApply ? 'apply' : 'dry-run', runTime: runTime.toDate().toISOString(), ...summary }, null, 2), 'utf8');
  return file;
}

// ---------- U1: user timestamps ----------
async function runU1() {
  const usersSnap = await db.collection('users').get();
  const changes = [];
  let skipped = 0;
  const bySource = { auth: 0, patients: 0, runTime: 0 };

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    if (data.createdTimestamp) {
      skipped++;
      continue;
    }
    const uid = userDoc.id;
    let created = null;
    let source = null;

    // (1) Firebase Auth creation time
    try {
      const authUser = await auth.getUser(uid);
      const d = toDate(authUser.metadata.creationTime);
      if (d) { created = d; source = 'auth'; }
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }

    // (2) Earliest createdTimestamp among the user's patients
    if (!created) {
      const patientsSnap = await db.collection('patients').where('caretakerId', '==', uid).get();
      for (const p of patientsSnap.docs) {
        const d = toDate(p.data().createdTimestamp);
        if (d && (!created || d < created)) created = d;
      }
      if (created) source = 'patients';
    }

    // (3) Run time
    if (!created) { created = runTime.toDate(); source = 'runTime'; }

    bySource[source]++;
    changes.push({ uid, email: data.email || null, createdTimestamp: created.toISOString(), source });
    console.log(`   ${isApply ? '🔥 Writing' : '👉 Would write'} users/${uid} (${data.email || 'no email'}): createdTimestamp=${created.toISOString()} [${source}], updatedTimestamp=run time`);
    if (isApply) {
      await userDoc.ref.update({ createdTimestamp: Timestamp.fromDate(created), updatedTimestamp: runTime });
    }
  }

  const counts = { users: usersSnap.size, written: changes.length, alreadyHadCreatedTimestamp: skipped, bySource };
  console.log(`   Summary: ${changes.length} user(s) ${isApply ? 'written' : 'to write'} (auth ${bySource.auth}, patients ${bySource.patients}, run time ${bySource.runTime}); ${skipped} already had createdTimestamp.`);
  return { counts, changes };
}

// ---------- U2: storage restructure ----------
const OLD_PREFIX = 'App_config/';
const PATIENT_PREFIX = 'App_config/patient_documents/';
const USER_PLACEHOLDER = 'App_config/user_documents/.keep';
const CONFIG_FILE_FIELDS = [
  ['consentSettings', 'consent_files', 'apitherapy'],
  ['treatmentInstructions', 'instructionsFiles', 'apitherapy'],
];

/** Compares source and copy metadata; returns a list of differences (empty = verified). */
function compareMeta(src, dst) {
  const problems = [];
  if (String(src.size) !== String(dst.size)) problems.push(`size ${src.size} vs ${dst.size}`);
  if (src.md5Hash && dst.md5Hash && src.md5Hash !== dst.md5Hash) problems.push('md5Hash differs');
  if ((src.contentType || '') !== (dst.contentType || '')) problems.push(`contentType "${src.contentType}" vs "${dst.contentType}"`);
  const srcToken = src.metadata?.firebaseStorageDownloadTokens;
  const dstToken = dst.metadata?.firebaseStorageDownloadTokens;
  if (srcToken && srcToken !== dstToken) problems.push('download token differs');
  return problems;
}

async function runU2() {
  // Files directly under App_config/ (the delimiter leaves out subfolders)
  const [files] = await bucket.getFiles({ prefix: OLD_PREFIX, delimiter: '/' });
  const topFiles = files.filter(f => f.name !== OLD_PREFIX && !f.name.slice(OLD_PREFIX.length).includes('/'));

  const copies = [];      // { from, to, status }
  const verified = new Map(); // old path -> new path (copy exists and matches)
  const failures = [];

  for (const file of topFiles) {
    const from = file.name;
    const to = PATIENT_PREFIX + from.slice(OLD_PREFIX.length);
    const dest = bucket.file(to);
    const [srcMeta] = await file.getMetadata();
    const [destExists] = await dest.exists();

    if (!isApply) {
      copies.push({ from, to, status: destExists ? 'copy already exists (will verify)' : 'would copy' });
      verified.set(from, to);
      console.log(`   👉 ${destExists ? 'Copy exists, would verify' : 'Would copy'}: ${from} -> ${to}`);
      continue;
    }

    if (!destExists) {
      await file.copy(dest);
      // Make sure metadata (incl. the download token) is the same as the original
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
    const problems = compareMeta(srcMeta, dstMeta);
    if (problems.length) {
      failures.push({ from, to, problems });
      copies.push({ from, to, status: 'VERIFY FAILED — original kept', problems });
      console.log(`   ⚠️ Verify failed: ${from} -> ${to}: ${problems.join('; ')} — original kept`);
    } else {
      verified.set(from, to);
      copies.push({ from, to, status: destExists ? 'copy already existed, verified' : 'copied, verified' });
      console.log(`   🔥 ${destExists ? 'Copy already existed, verified' : 'Copied and verified'}: ${from} -> ${to}`);
    }
  }

  // Update the template paths in cfg_app_config/main
  const configRef = db.collection('cfg_app_config').doc('main');
  const configSnap = await configRef.get();
  const configUpdates = {};
  const configChanges = [];
  const configWarnings = [];
  if (configSnap.exists) {
    const config = configSnap.data();
    for (const fieldPath of CONFIG_FILE_FIELDS) {
      const langMap = fieldPath.reduce((o, k) => (o ? o[k] : undefined), config) || {};
      for (const [lang, value] of Object.entries(langMap)) {
        const p = toStoragePath(value);
        const key = [...fieldPath, lang].join('.');
        if (!p || p.startsWith(PATIENT_PREFIX)) continue;
        if (verified.has(p)) {
          configUpdates[key] = verified.get(p);
          configChanges.push({ field: key, from: value, to: verified.get(p) });
          console.log(`   ${isApply ? '🔥 Updating' : '👉 Would update'} cfg_app_config/main ${key}: ${p} -> ${verified.get(p)}`);
        } else {
          configWarnings.push({ field: key, value, reason: 'file not found directly under App_config/ (or its copy failed) — left unchanged' });
          console.log(`   ⚠️ cfg_app_config/main ${key} = ${value}: file not found directly under App_config/ (or its copy failed) — left unchanged`);
        }
      }
    }
  } else {
    configWarnings.push({ reason: 'cfg_app_config/main does not exist' });
    console.log('   ⚠️ cfg_app_config/main does not exist');
  }
  if (isApply && Object.keys(configUpdates).length) {
    await configRef.update(configUpdates);
  }

  // Delete the verified originals (only after the config points to the copies)
  const deletes = [];
  for (const from of verified.keys()) {
    deletes.push(from);
    console.log(`   ${isApply ? '🔥 Deleting' : '👉 Would delete'} original: ${from}`);
    if (isApply) await bucket.file(from).delete({ ignoreNotFound: true });
  }

  // Placeholder for the (empty) user_documents folder
  const placeholder = bucket.file(USER_PLACEHOLDER);
  const [placeholderExists] = await placeholder.exists();
  if (!placeholderExists) {
    console.log(`   ${isApply ? '🔥 Creating' : '👉 Would create'} placeholder: ${USER_PLACEHOLDER}`);
    if (isApply) await placeholder.save('', { contentType: 'text/plain' });
  }

  const counts = {
    filesDirectlyUnderAppConfig: topFiles.length,
    copiedOrVerified: verified.size,
    verifyFailures: failures.length,
    configValuesUpdated: configChanges.length,
    configWarnings: configWarnings.length,
    originalsDeleted: deletes.length,
    placeholderCreated: !placeholderExists,
  };
  console.log(`   Summary: ${topFiles.length} file(s) under App_config/, ${verified.size} ${isApply ? 'copied/verified' : 'to copy'}, ${failures.length} verify failure(s), ${configChanges.length} config value(s) ${isApply ? 'updated' : 'to update'}, ${configWarnings.length} config warning(s), ${deletes.length} original(s) ${isApply ? 'deleted' : 'to delete'}, placeholder ${placeholderExists ? 'already exists' : (isApply ? 'created' : 'to create')}.`);
  return { counts, copies, configChanges, configWarnings, deletes, failures };
}

// ---------- U3: plan for all users ----------
// Spec "Registration, Roles, Plans and User Terms" §9. Roles are not changed: existing users
// already have caretaker/admin/superadmin; any other role is only reported.
async function runU3() {
  const usersSnap = await db.collection('users').get();
  const changes = [];
  const unusualRoles = [];
  let skipped = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data();
    if (!['caretaker', 'admin', 'superadmin'].includes(data.role)) {
      unusualRoles.push({ uid: userDoc.id, role: data.role ?? null });
      console.log(`   ⚠️ users/${userDoc.id}: role "${data.role ?? ''}" (not changed — check by hand)`);
    }
    if (data.plan) {
      skipped++;
      continue;
    }
    changes.push({ uid: userDoc.id, plan: 'free' });
    console.log(`   ${isApply ? '🔥 Writing' : '👉 Would write'} users/${userDoc.id}: plan=free, updatedTimestamp=run time`);
    if (isApply) {
      await userDoc.ref.update({ plan: 'free', updatedTimestamp: runTime });
    }
  }

  const counts = { users: usersSnap.size, written: changes.length, alreadyHadPlan: skipped, unusualRoles: unusualRoles.length };
  console.log(`   Summary: ${changes.length} user(s) ${isApply ? 'given' : 'to give'} plan=free; ${skipped} already had a plan; ${unusualRoles.length} with a role other than caretaker/admin/superadmin (reported only).`);
  return { counts, changes, unusualRoles };
}

// ---------- U4: User Terms configuration ----------
// Spec §9: cfg_app_config/userTerms with no versions and no currentVersion. The first version is
// uploaded and published by the superadmin in Application Settings; until then the acceptance
// check is not applied.
async function runU4() {
  const ref = db.collection('cfg_app_config').doc('userTerms');
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() || {};
    console.log(`   cfg_app_config/userTerms already exists (currentVersion: ${data.currentVersion || 'none'}, ${Object.keys(data.versions || {}).length} version(s)) — left unchanged.`);
    return { counts: { created: 0, alreadyExisted: 1 }, existing: { currentVersion: data.currentVersion || null, versions: Object.keys(data.versions || {}) } };
  }
  console.log(`   ${isApply ? '🔥 Creating' : '👉 Would create'} cfg_app_config/userTerms = { versions: {} }`);
  if (isApply) {
    // create() fails if another run created it meanwhile, so it can never overwrite
    await ref.create({ versions: {} });
  }
  return { counts: { created: 1, alreadyExisted: 0 } };
}

// ---------- registry ----------
const ITEMS = [
  { id: 'U1', phase: 1, title: 'createdTimestamp and updatedTimestamp for all users', run: runU1 },
  { id: 'U2', phase: 1, title: 'Storage: App_config split into patient_documents and user_documents', run: runU2 },
  { id: 'U3', phase: 2, title: 'plan = free for every user without a plan', run: runU3 },
  { id: 'U4', phase: 2, title: 'cfg_app_config/userTerms with no versions', run: runU4 },
];

let selected;
if (itemsArg) {
  const ids = itemsArg.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const unknown = ids.filter(id => !ITEMS.some(i => i.id === id));
  if (unknown.length) {
    console.error(`❌ Unknown or not yet defined item(s): ${unknown.join(', ')}. Defined: ${ITEMS.map(i => i.id).join(', ')}`);
    process.exit(1);
  }
  selected = ITEMS.filter(i => ids.includes(i.id));
} else {
  selected = ITEMS.filter(i => String(i.phase) === phaseArg);
  if (!selected.length) {
    console.error(`❌ No defined items for phase ${phaseArg}.`);
    process.exit(1);
  }
}

// ---------- main ----------
(async () => {
  console.log(`🔍 Environment target: ${project.toUpperCase()} (bucket ${target.bucket})`);
  console.log(`🧹 Mode: ${isApply ? 'LIVE WRITE (--apply)' : 'DRY-RUN (REVIEW ONLY)'}`);
  console.log(`📋 Items: ${selected.map(i => i.id).join(', ')}`);
  let failed = false;
  for (const item of selected) {
    console.log(`\n=== ${item.id} — ${item.title} ===`);
    try {
      const summary = await item.run();
      const reportFile = writeReport(item.id, summary);
      console.log(`   📝 Report: ${reportFile}`);
    } catch (err) {
      failed = true;
      console.error(`   ❌ ${item.id} failed:`, err);
      writeReport(item.id, { error: String(err && err.stack || err) });
    }
  }
  if (!isApply) console.log('\n👉 Dry run only. Run with --apply to write these changes for real.');
  process.exit(failed ? 1 : 0);
})();
