# Entity Documents: Clean Storage and Language Folders — Plan

> **For any new agent session:** this is the master plan. Read §0 first, then find the current step in §7 (Progress tracker) and work only on that step.

## Context

Problems, protocols, points and measures can each have one PDF per language (`documentUrl`). The way the admin screens store these files leaves the Storage bucket untidy: unused files remain, files of new items stay in a `new/` folder, and nothing in a file's path says its language.

The user wants to **translate the Hebrew PDFs into English** (a separate process, §6). That process needs a clean bucket: only files that are in use, each under its own item, with the language visible in the path. This plan gets there in two parts:
- **A.** Fix the admin screens so they stop creating garbage and always save in the new layout.
- **B.** A one-time migration per environment: move every file in use into the new layout and delete unused files.

Status: **plan, waiting for the user's review** (03/10/2026). No code written.

---

## 0. Session start-up (read first, every session)

1. Read `CLAUDE.md`, `airules.md` (change only what the step lists; ask before touching other components; no build or deploy by the agent), `Claude Style-Guide.md`, this plan.
2. Run `git branch --show-current` and `git status`. The user may have merged or switched branches between sessions.
3. **Standing rules:** no commits, pushes, branches, package installs, config or `.env` edits, file deletions or renames without explicit instruction; every script run needs the user's approval each time; the user deploys (`deploy-staging.ps1`, then `finish-feature.ps1`, which merges and deploys to production); commit messages via `git commit -F <file>`.
4. Testing: no unit tests; by hand on the emulators (`npm run dev:all`) and staging; the migration script always runs as a dry run first and the user reviews its report.
5. One step at a time; show results and wait for the user's acknowledgement before the next step.

---

## 1. Findings (code as of 03/10/2026)

### 1.1 How documents are stored today
- `documentUrl` on `cfg_acupuncture_points`, `cfg_protocols`, `cfg_problems`, `cfg_measures` is a map language → Storage path, e.g. `{ he: "Points/abc/1777474416931_CV24.pdf" }`. An old format may still exist: a single string with no language (§3).
- Upload: `uploadFile` (`src/services/storageService.ts`) writes `<folder>/<timestamp>_<original name>` and returns the path. A new upload always gets a new path.
- The admin screens upload **as soon as the file is picked**, before Save: `PointsAdmin.tsx` ~213, `ProtocolAdmin.tsx` ~253, `ProblemAdmin/ProblemAdmin.tsx` ~85, `MeasureAdmin/MeasureAdmin.tsx` ~353. The folder is `<Type>/<item id>`, or `<Type>/new` when the item is new (it has no id until `addDoc` on Save). The file is never moved afterwards, so new items keep reading their document from `new/` for good.
- All four forms show the document through the shared `src/components/shared/DocumentManagement.tsx` (one document per language: Hebrew, English, Arabic, Russian).
- Readers of `documentUrl`: Treatment Execution (`TreatmentExecution.tsx`), the Knowledge pages (`knowledgeService.ts`, `DocumentLinks.tsx`), the admin screens, and (Phase B, paused) the knowledge-search indexer. **No other collection copies these paths**, so moving a file only requires updating `documentUrl`.

### 1.2 What happens to old files today

| Screen | Replacing a document | Removing a document | Deleting the item |
|---|---|---|---|
| Points | old file **stays** | deleted on Save | files deleted |
| Protocols | old file **stays** | old file **stays** | files deleted |
| Problems | old file **stays** | deleted **immediately**, before Save | — |
| Measures | old file deleted **immediately, before the new upload and before Save** | deleted on Save | files deleted |

Leftovers come from: replacing a document (Points, Protocols, Problems), uploading and then cancelling the form, and uploading twice before saving.
**Worse than leftovers:** Measures (replace) and Problems (remove) delete the old file before the new state is saved. If the admin then cancels, Firestore points at a deleted file and caretakers get a broken link.

### 1.3 Inconsistency in the old single-string format
For a `documentUrl` that is a single string: the admin screens treat it as **English** (`{ en: value }`); the Knowledge pages treat it as the App Settings **default language** (Hebrew). See §3.

### 1.4 Not in scope
- `Patients/` files (consent, instructions, documents). Separate issue noted: the consent and instructions screens upload to `Patients/new/` before the patient is saved, but the storage rules allow writes under `Patients/<id>/` only when that patient document exists, so those uploads are probably refused. To be checked separately (signed patient documents).
- `App_config/` files.
- Storage cost: the documents are small (≈170 KB each, tens of MB in total), so leftovers cost under USD 0.01/month. The goal is a correct, clean bucket for the translation process. Backup buckets of both projects now delete daily backups after 30 days (lifecycle rule on `ScheduledBackup/`, checked by the user 03/10/2026).

---

## 2. Decisions

| # | Decision | By / date |
|---|---|---|
| D1 | Clean bucket: only files referenced by an item; all of `new/` emptied. | User, 03/10/2026 |
| D2 | **Layout: `<Type>/<entityId>/<lang>/<timestamp>_<original file name>`**, e.g. `Points/4bwJMuXodZwni7UD4h9C/he/1777474416931_KID10 Yingu.pdf`. After the migration each item-language folder holds exactly one file. | User, 03/10/2026 |
| D3 | The timestamp stays in the name: a replaced document always gets a new path (the knowledge-search index and browser caches depend on that). | Agent proposal, accepted with D2 |
| D4 | **Firestore `documentUrl` is the source of truth; the bucket mirrors it.** Any process that adds a file (incl. translation) must also set `documentUrl`, or the file is an orphan and will be deleted. | Agent proposal, 03/10/2026 |
| D5 | Old single-string values get an explicit language, decided as in §3 (count first; decide by hand if few; character counting if many). | User, 03/10/2026 |
| D6 | The new path is created in the order: copy / upload → update Firestore → delete the old file. A file is never deleted before the Firestore change that stops using it has succeeded. | Agent proposal, 03/10/2026 |

---

## 3. Old single-string `documentUrl` values

**Problem:** such a value has no language, and the screens disagree (§1.3). The migration must put each file in a language folder, and the translation process looks for "items with a Hebrew document and no English one", so a Hebrew file marked English would never be translated.

**Solution (D5), in this order:**
1. The migration's dry run **counts** the items with a single-string `documentUrl` and lists them (type, item, file, link).
2. **None:** nothing to decide.
3. **A few:** the user opens each PDF and gives the language; the script takes the answers from an input file (`--legacy-langs=<file>`, one line per item: `<collection>/<id> <lang>`). Items without an answer are left unchanged and listed again.
4. **Many:** the language is decided by **counting letters** in the PDF's text (user proposal): Hebrew letters (U+05D0–U+05EA) against Latin letters (A–Z, a–z), digits, punctuation and spaces not counted; the language with more letters wins. A document is **"unclear"** when neither has at least 60% of the letters, or when the PDF has no text (a scanned page); unclear documents are listed for the user, as in 3. Reading PDF text needs a PDF library (`pdfjs-dist`, used by the script only); the project has none, so this needs the user's approval to install. Hebrew documents contain many Latin codes and terms ("BL 40"); the majority rule and the 60% threshold allow for that.

After the migration every `documentUrl` is a map with explicit languages, and the admin screens always save maps (Part A), so the old format does not come back.

---

## 4. Part A: one document logic for the four admin screens

**Goal:** no garbage is created, nothing is ever deleted too early, and every new upload lands in `<Type>/<id>/<lang>/`.

### 4.1 Behaviour
1. **The id comes first.** When a new item's form opens, it gets its Firestore id without writing anything (`doc(collection(db, '<collection>')).id`), and Save uses `setDoc` with that id instead of `addDoc`. Uploads always go to the item's own folder; `new/` is never used again.
2. **Upload on Save, not when the file is picked.** The form keeps the chosen file (per language) and shows its name; the admin can open the new PDF after Save.
3. **Save order (D6):**
   1. upload each newly chosen file to `<Type>/<id>/<lang>/<timestamp>_<name>`;
   2. write the item to Firestore with the new `documentUrl` (always a map);
   3. only after step 2 succeeded, delete the files that were replaced or removed.
   - Step 1 fails → nothing is written; files already uploaded in this Save are deleted; error shown.
   - Step 2 fails → the files uploaded in step 1 are deleted; the old ones are untouched; error shown.
   - Step 3 fails (e.g. network) → the item is saved correctly; the old file is only a leftover, found by the migration script's orphan check if it is run again (§4.3).
4. **Removing a document** marks it in the form; the file is deleted in step 3 of Save. No immediate deletes.
5. **Cancel** leaves nothing behind (nothing was uploaded).
6. **Deleting an item** deletes its files after the Firestore delete succeeded (as today for Points, Protocols, Measures; added for Problems if items can be deleted there).

### 4.2 Files
- New: `src/services/entityDocuments.ts` (pending files per language, upload, the Save sequence, delete after save, path builder `<Type>/<id>/<lang>/…`, old string → map).
- Changed: `src/components/shared/DocumentManagement.tsx` (show a chosen-but-not-uploaded file), `PointsAdmin.tsx`, `ProtocolAdmin.tsx`, `ProblemAdmin/ProblemAdmin.tsx`, `ProblemAdmin/ProblemForm.tsx`, `MeasureAdmin/MeasureAdmin.tsx`.
- Unchanged: `storage.rules` (the new paths are still under `Points/**` etc.), `storageService.ts` `uploadFile` (called with the new folder).

### 4.3 Periodic cleanup
Not planned. After Part A, leftovers can only come from a failed delete in Save step 3. The migration script (Part B) can be re-run any time (dry run first) to find them; a scheduled function is added only if leftovers keep appearing.

### 4.4 Verification (dev, then staging)
In Hebrew and English, for each of the four screens: new item with a document → file in `<Type>/<id>/<lang>/`, nothing in `new/`; replace → old file gone, new one opens; remove → file gone after Save; pick a file then Cancel → nothing uploaded; Save with the network off at the last moment → no broken link (as far as can be simulated).

---

## 5. Part B: migration script (once per environment)

`scripts/migrations/reorganize-entity-documents.js --project=dev|staging|prod [--apply] [--legacy-langs=<file>]`
Dry run (default): changes nothing, writes the report (§5.4). `--apply`: performs the moves and deletes listed in a fresh plan. Idempotent: a second run finds nothing to do.

### 5.1 How unreferenced files are found
Two lists, compared in both directions.

**List 1 — referenced paths (Firestore):**
- every document of `cfg_acupuncture_points`, `cfg_protocols`, `cfg_problems`, `cfg_measures`, **active and inactive** (an inactive item may be reactivated with its document);
- every value of `documentUrl`, all languages; for an old single-string value, the string;
- each value **normalised to a plain Storage path**: most are already paths; older ones may be full download URLs (`https://…/o/Points%2Fabc%2F1777_x.pdf?…`, decoded) or `gs://<bucket>/…` (bucket removed). Same logic as `storagePathOf` in `functions/src/knowledge/chunks.ts`. Without this, a file referenced by an old URL would wrongly look unreferenced.

**List 2 — existing files (Storage):**
- every file under `Points/`, `Protocols/`, `Problems/`, `Measures/` in the app bucket (`SOURCE_MEDIA_BUCKET` from `functions/.env.<projectId>`), with creation time and size.

**Comparison:**

| In Storage | In Firestore | Meaning | Action |
|---|---|---|---|
| ✔ | ✔ | referenced file | keep; move into the layout if not there yet (§5.2) |
| ✔ | ✘ | **orphan** | delete, if older than 7 days |
| ✘ | ✔ | **broken reference** | report only; the admin re-uploads or clears it |

**Safeguards:**
- paths compared exactly (case and characters; Hebrew and spaces are fine since both sides are decoded plain paths);
- **age limit:** a file younger than 7 days is never deleted, even if unreferenced (an admin may be in the middle of an edit, or saved between the two listings);
- only the four folders are listed; `Patients/` and `App_config/` can never be touched;
- empty "folder" placeholder objects (created in the console) are ignored;
- a path referenced by more than one item or language (not expected) is reported and not moved;
- dry run first, report reviewed by the user; deleted files remain in the daily backups for 30 days.

### 5.2 Moving a referenced file
Target: `<Type>/<entityId>/<lang>/<original file name with its timestamp>` (the file name part is kept as is, so the timestamp and original name survive). A file already at its target is left alone.
For each file, one at a time (D6):
1. **copy** the file to the target (server-side copy with the Admin SDK; keeps content type and download tokens);
2. **update Firestore:** set `documentUrl.<lang>` of that item to the target path, **only if the value is still the old path** (checked in a transaction), so an admin edit made meanwhile is never overwritten; an old single-string value is replaced by a map in the same write;
3. **delete** the original.

If the run stops halfway: after 1 only → an extra copy at the target, unreferenced → the next run sees it as an orphan, but it is younger than 7 days, so it stays until a later run deletes it (or the next run's move overwrites it, since the target path is the same); after 2 → the original is unreferenced and is deleted by the next run (orphan, older than 7 days). In no case does Firestore point at a missing file.

### 5.3 Old single-string values
Handled per §3 (listed in the dry run; moved only once their language is known).

### 5.4 Report
`scratch/reorganize-documents-<project>-<timestamp>.json` (gitignored), also summarised on screen: per folder the counts and sizes of referenced files (already in place / to move), orphans (to delete / younger than 7 days, kept), broken references, old single-string values (with the language found, or "unclear"). With `--apply` it records every old → new path and every deleted file: a restore record together with the backups.

### 5.5 When to run
After Part A is released (so no new garbage appears during the cleanup), at a quiet time: the Knowledge pages cache the item list for 10 minutes, so a caretaker with the page open could hit an old path until it reloads. Order: dev → staging → production, each dry run → user review → `--apply` → a second dry run that finds nothing.
Knowledge search Phase B (paused) has not indexed production; run this migration **before** any Phase B index build, so moved paths cost no re-transcription.
The `cfg_*` BigQuery export extensions record the `documentUrl` updates as ordinary changes (harmless).

---

## 6. After A and B: translation process (separate design)
Out of scope here. Prerequisites this plan provides: every item's documents are listed in `documentUrl` with an explicit language; the inputs are "items with a `he` document and no `en` document"; Hebrew files are at `<Type>/<id>/he/`. Whatever produces the English PDF (a tool or a person), it must be attached through `documentUrl` (admin screen, or a script that follows D6), into `<Type>/<id>/en/`.

---

## 7. Progress tracker

| Step | Status | Branch | Notes |
|---|---|---|---|
| Plan | Written 03/10/2026, **waiting for the user's review** | — | D2 and D5 confirmed by the user; the rest proposed. |
| B0 Dry run only (count) | Not started | | Optional first look: the script's dry run can be written and run before Part A to see the real numbers (orphans, `new/`, old single-string values). Changes nothing. |
| A Admin screens | Not started | | Explain the components touched before editing (`airules.md`). |
| B Migration (dev, staging, prod) | Not started | | After A is released. |
