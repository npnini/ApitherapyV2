# Syncing the local emulator from staging

## Why this exists

The local Firestore/Storage/Auth emulator only has data because someone imported it — nothing keeps it in sync with staging automatically. On 2026-08-16, a routine repo cleanup surfaced a real incident: the points-forklift migration (M1–M3) was run independently against dev, staging, and production per the project's normal workflow, but the **dev run only ever modified a live local emulator's in-memory state** — nobody exported it back to `emulator-data/` afterward. The on-disk snapshot stayed frozen at an August 11 pre-migration state while the emulator kept running for days. When that emulator process was eventually stopped without an export, the on-disk copy became the only "current" local data — and it was stale by a full migration's worth of changes.

**The fix in that situation, and the general recovery/refresh procedure, is this document.**

Because dev/staging/prod are migrated independently (see project convention: scripts accept `--project=dev|staging|prod`), **staging is the authoritative source for what local dev data should look like** whenever the local copy is suspect, stale, or just missing something new. Production is the authoritative source of truth for the app itself, but staging is what local dev should mirror.

## When to run this

- The local emulator's data structure doesn't match what a recent migration should have produced (e.g., a new field or collection is missing).
- Setting up local dev on a new machine with no `emulator-data/` yet.
- After any multi-environment migration/forklift where the dev run might not have been exported cleanly.
- Local data has drifted so far from staging that debugging against it is unreliable.

## How to do it

### 1. Get a clean local emulator

Don't try to selectively clear collections with a script — **`scripts/fixtures/clear-collections.js` does not target the emulator**. It initializes the Firebase Admin SDK with no `FIRESTORE_EMULATOR_HOST` override, so running it connects straight to whatever real project `service-account.json` points to (currently `apitherapyv2`, i.e. staging) and permanently deletes `treatments`, `measured_values`, `patients`, `patient_medical_data`, `questionnaire_responses`, and `feedback_sessions` there. It was written for a different purpose; do not use it to "empty the local emulator."

The safe way to get a clean local slate is to just not import anything:

```powershell
npx firebase emulators:start
```

(no `--import` flag — this gives a genuinely empty local Firestore/Auth/Storage, no data-deleting script involved, zero risk to staging/prod).

### 2. Run the sync

With the empty emulator running, in a second terminal:

```powershell
npm run sync-data
```

This runs `scripts/dev/sync-firestore.js`, which:
- **Reads** every collection in its `COLLECTIONS` list from live staging (`apitherapyv2`, via `service-account.json` at repo root) — this is read-only against staging, it never writes back.
- **Writes** those documents, all Storage files, and all Auth users into the local emulator (via `FIRESTORE_EMULATOR_HOST=localhost:8080` etc., which the script sets itself).

It's safe to re-run — writes are upserts (`batch.set` by document ID), so running it again just re-syncs everything, it won't duplicate data.

### 3. ⚠️ Keep the COLLECTIONS list honest

`sync-firestore.js`'s `COLLECTIONS` array is a **hardcoded list**, not derived from staging automatically. On 2026-08-16 it was found to be missing `cfg_point_groups` (added by the points-forklift migration, M1) and `app_audit_log` — meaning two real staging collections were silently skipped on every sync until someone noticed data was missing after the fact. That's now fixed, but the pattern can recur: any time a new top-level collection is added to the app, this list needs a manual update, or a future sync will silently omit it again.

To check whether the list is current, run this against staging (adjust path as needed) before relying on a sync:

```js
const cols = await db.listCollections();
cols.forEach(c => console.log(c.id));
```

Compare the result against `COLLECTIONS` in `scripts/dev/sync-firestore.js` and add anything missing.

### 4. Save the result to disk

The sync only affects the running emulator's memory. To persist it as the new `emulator-data/` baseline:

```powershell
npx firebase emulators:export ./emulator-data --force
```

**Known Windows issue:** this command frequently reports `Error: Export request failed` even though the internal export actually succeeded. What happens is the emulator writes a complete export to a randomly-named temp folder at the repo root (`firebase-export-<timestamp><random>/`), then the CLI's final move-into-place step fails (a Windows file-lock/EPERM issue, the same class of problem `scripts/dev/start-dev.js` already works around for its own export-on-exit path). If you hit this:

1. Look for an orphaned `firebase-export-*` folder at the repo root.
2. Confirm it's complete (`auth_export/`, `firestore_export/`, `storage_export/` subfolders all present, not just `firebase-export-metadata.json` alone).
3. Delete the old `emulator-data/` and copy the orphaned folder's contents into `emulator-data/` in its place.
4. Clean up the orphaned temp folder.

Then verify with a full round-trip: stop the emulator, restart with `--import=./emulator-data` only (no live data in memory), and query a few collections to confirm the data survived.

### 5. Take a checkpoint before/after risky work

Before running a migration or any other data-affecting local work, it's worth saving a named checkpoint separate from the live `emulator-data/` — see `emulator-data-backups/` (gitignored). Naming convention: `checkpoint-<branch-of-the-work>-<YYYYMMDD-HHMMSS>`, e.g. `checkpoint-Phase6-PointSideAnalysisUpdate-20260816-142742`. This makes it easy to roll back to a known-good point without depending on `emulator-data/` itself staying untouched.
