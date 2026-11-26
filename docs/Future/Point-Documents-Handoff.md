# Handoff: point documents (language folders, English import) and the treatment export

Written 24/11/2026 for the next agent session. It records what was done in the long session of 22-24/11/2026, the state of every environment, the scripts and how to run them, what is still open, and a list of improvement candidates. **There are no pending app changes:** everything described here is committed on `main` (commit `3234840`, "point document folders structure modified for app") and the working tree was clean at the end of the session.

## 1. Where things stand

| Item | State |
|---|---|
| Treatment export (print/PDF of selected treatments) | In `main` (commit `d79ee20`). Sidebar width fix and `ProblemList` hooks fix went with it. |
| Point documents in language folders (admin screen) | In `main` (commit `3234840`). The user reported the production deploy running on 24/11/2026; confirm it finished if it matters. |
| Hebrew point documents moved to `Points/<id>/he/` | **Done on dev, staging and production** (23/11/2026). |
| Unreferenced files and empty folders in `Points/` | **Deleted on dev, staging and production.** Last production dry run: 0 unreferenced, 0 empty folders. |
| English point documents (from Word files) | **Uploaded on dev (159), staging (159) and production (365).** Production final review: `readyToUpload 0`, `alreadyHasEnglish 365`. |
| Open items | See §6 and §7. |

Working rules for this user are in `CLAUDE.md`, `airules.md` and the memory index (read them first). The ones that mattered most in this session:
- The user runs every script, build and deploy. Write the command; don't run a script yourself unless it is read-only (`npx tsc --noEmit`, a dry run the user asked for).
- `airules.md`: never modify a component without asking; explain the impact of shared changes first.
- No commit, push, branch or PR without an explicit request. Branches: `scripts\deploy\new-branch.ps1`; commit and merge: `finish-feature.ps1`. Commit messages through `git commit -F <file>`, file written without a BOM.
- All scripts under `scripts/` run from the repo root. The shell tool's working directory can drift into `scratch\`; use `Set-Location` first.
- Never run the emulator save scripts or delete `emulator-data*` folders.
- Dates are shown dd/mm/yyyy. UI strings are machine-translated per exact English string: reuse existing strings.

## 2. What was built

### 2.1 Treatment export (Option 1 of "Patient Data Export")
- Button **Export** next to "Show Model" in Treatment History (hidden in the read-only side panel). Select treatments (existing checkboxes), click Export, choose which personal details to include (name, identity number, email, mobile; all unticked) and "Include images" (ticked), then the app opens the browser print window with only the report. The user prints or chooses "Save as PDF".
- Files: `src/components/TreatmentExport/` (`TreatmentExportModal.tsx`, `TreatmentExportReport.tsx`, `exportImages.ts`, `TreatmentExport.module.css`), edits in `TreatmentHistory.tsx`, print rules at the end of `src/globals.css`.
- Photos are loaded first and scaled to at most 1200px; the report waits for them before printing.
- Each export writes an activity-log entry (`action: 'export'`, IDs, counts and field names only, no values). `auditLogService.ts` has the new action; `ActivityLog` has a badge for it.
- **Not built:** Option 2 (the full patient "book": all intake tabs plus per-measure 6-month graphs). **Not tested:** phones (Android Chrome "Save as PDF", iOS Safari print preview).

### 2.2 Point documents: language folders in the admin screen (Part A of the cleanup plan, Points only)
- New uploads go to `Points/<pointId>/<lang>/<timestamp>_<name>.pdf`. A new point gets its Firestore id when the form opens, so `Points/new/` is never used again. Files are uploaded **on Save**, not when picked; Cancel leaves nothing behind. Save order: upload, write the point, delete the files the point no longer uses. Deleting a point deletes the point first, then its files.
- Files: `src/services/entityDocuments.ts` (new, shared; `DocumentFolderType` is `'Points'` only, extend it for the other screens), `src/components/PointsAdmin.tsx`, `src/components/shared/DocumentManagement.tsx` (new optional prop `hasPendingFile`; View Document disabled until the file has loaded), `src/hooks/useStorageUrl.ts`.
- `useStorageUrl` fix: it now depends on the resolved file path (not the input object), returns a link only for the file it was made for, and releases blob links after 60 seconds. This fixed an intermittent `blob:` `ERR_FILE_NOT_FOUND` when switching language tabs in Edit Point.

### 2.3 Scripts (all in `scripts/migrations/`, catalogued in `docs/operations/script-catalog.md`)
| Script | Purpose |
|---|---|
| `reorganize-point-documents.js` | Moves point documents into `Points/<id>/<lang>/`. Dry run by default. Also lists unreferenced files and empty folders. |
| `convert-docx-to-pdf-macro.bas` | VBA module that converts every `.docx` to PDF **inside Word**. This is the method that works on this PC. |
| `convert-docx-to-pdf.ps1` | Same conversion through PowerShell and Word automation. **It hangs on this PC** (opens the file, then stops in the save call, both `-Method Export` and `SaveAs`). Kept for reference. |
| `import-point-documents.js` | Matches PDFs named `<code> - <label>.pdf` to points and uploads them to `Points/<id>/en/`. Review first, then `--apply --from=<report>`. |

## 3. Runbooks

### 3.1 reorganize-point-documents.js
```
node scripts/migrations/reorganize-point-documents.js --project=dev|staging|prod            # dry run
node scripts/migrations/reorganize-point-documents.js --project=... --apply [--limit=3]
node scripts/migrations/reorganize-point-documents.js --project=... --delete-unreferenced --delete-empty-folders [--apply]
```
- Per file: copy and verify, then update Firestore (transaction, only if the value is unchanged), then delete the original. Idempotent. A point's `imageURL` counts as a reference.
- Deleting unreferenced files is dev/staging; **on production a real run also needs `--confirm-prod-delete`**. Only files older than `--min-age-days` (default 7) are deleted, and nothing is deleted if the run had errors.
- Documents uploaded through the admin screen before 24/11/2026 were in the old layout; re-run the script if old-style files show up again.

### 3.2 English import
1. Download the Drive folder of `.docx` files into `scratch\point-docs-en\docx\` (gitignored, machine-local).
2. In Word: Alt+F11, import `convert-docx-to-pdf-macro.bas`, run `ConvertFirstFive`, check a few PDFs, run `ConvertAll`. PDFs land in `scratch\point-docs-en\pdf\`. Failed files are listed in `convert-failed.txt`.
3. Review: `node scripts/migrations/import-point-documents.js --project=prod --replace --map=scratch/point-docs-en/map-prod.json`. Read the lists (ambiguous, unmatched, label differs, replaced, points without English).
4. `--apply --from=<review report> --limit=3`, check those points in the app, then the same without `--limit`.
5. **Verify with a review WITHOUT `--replace`** (`readyToUpload` should be 0). With `--replace` every point that already has English is "ready to replace" again: never use it for re-checking, and do not re-apply a `--replace` review.
- Matching rules: the code before ` - ` against each point's code and bracketed alias; prefixes treated as equal: DU/GV, SJ/TW/TE, KID/KI, LIV/LR/LV, HN/NH; a leading `EX` is dropped (`EX-HN15` = `HN15`). The label is only a check. Ambiguous, unmatched and duplicate files are never uploaded; `--map` resolves them (`{"file.pdf": "<pointId>" | ["<id1>","<id2>"] | null}`).
- Map files used: `scratch/point-docs-en/map-dev-staging.json` (`DU14 - Dazhui.pdf` to the real DU14 point), `map-prod.json` (the three duplicate pairs, each PDF attached to both points).
- Reports: `scratch/reorganize-point-documents/` and `scratch/import-point-documents/` (gitignored; they are the only restore record of what moved).

## 4. State of the data

| | Dev | Staging | Production |
|---|---|---|---|
| Points | 163 | 163 (copy of dev) | 370 |
| Points with a Hebrew document | most | most | 367 |
| Hebrew documents in `he/` | yes | yes | yes (372 references, all moved) |
| English documents uploaded | 159 | 159 | 365 |
| Unreferenced files left | 0 | 0 | 0 |

Production details:
- The 5 old English test files (BL23, BL52, GV20, HN3, LI4) were replaced and deleted.
- The three duplicate pairs (**GV16 `P5vNi1pxMkKLogxKPeiB` / DU16 `jzzJLtSBwRVBkurj8TiT`**, **GV3 `7PMqgF5titBM0sNVPRs3` / DU3 `W20rZXO5GV74wCAYuCsd`**, **KID1 `u8CBUdLrmlkM6PHUl8LY` / KI1 `wBtlLGRur58isUjboR18`**) each got the same English PDF on both points.
- DU12 `MJqqdSGm5KawvsqsH3Ss`, KID13 `MAtZ7EsD6dw4sx9bTbD0` and KID22 `8nfp7mGPbtAg57I8u24x` had **no document at all**; they now have English only.
- Without an English document: BL18, PC7, SP3, SP19, SP21 (no file in the folder).
- `SJ8 - Sanyangluo.pdf` is unused: **no SJ8/TW8 point exists on production.**

## 5. Lessons from this session
- The cleanup plan said to change the admin screens first and migrate afterwards (§5.5). The order was reversed, which cost one extra run of the move script. Follow the plan's order next time.
- Word automation from PowerShell hung on this PC while Word's own Save as PDF worked; a VBA macro inside Word is the reliable route.
- A dry run that includes `--replace` is not a "nothing left to do" check (see §3.2 step 5).
- Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI: keep `.ps1` files pure ASCII.

## 6. Open items: data
- **Duplicate points on production** (the three pairs above, and **GV14 / DU14 on dev and staging**, where GV14 even has an old English test document). Decide which point is the real one and merge or remove the other. Careful: both are referenced by treatments and protocols possibly.
- **Wrong or placeholder data:** point KID25's English label is a Hebrew placeholder ("צרי מסמך עבור נקודת הדיקור KI25"); PC2's label is "XinBao" instead of "Tianquan"; CV17 is "Danzhong" (the file says "Shanzhong"; both are valid); codes `NH5` and `LV3` look like typos (HN5, LIV3), and KID/KI spellings are mixed.
- **`imageURL` holds text, not an image path,** on production points BL21 ("WeiShu"), BL50, LIV6, DU15 and GB40 (descriptions of the point). The app tries to load them as images. Clear them.
- **Missing documents:** SJ8 has no point; BL18, PC7, SP3, SP19, SP21 have no English file; DU12, KID13, KID22 have no Hebrew document.

## 7. Improvement candidates (none started)
1. **Protocols, Problems, Measures admin screens** still upload in the old layout (`<Type>/<id>/<ts>_<name>`, `<Type>/new/` for new items, deletes before Save). Apply the Part A pattern with `entityDocuments.ts` (extend `DocumentFolderType`), then generalise the reorganize script (it is points-only) and run it per environment. Plan: `docs/Future/Entity-Documents-Cleanup-Plan.md`.
2. **Hooks called inside loops** (React "order of Hooks" warnings): `MeasureAdmin.tsx` (about lines 501, 510, 520, 726, 813), `PointGroupAdmin.tsx` (349, 359), `SessionOpening.tsx` 272, `ScaleMeasuresGraph.tsx` 116, `UserDetails.tsx` (256-270, 442). `ProblemList.tsx` is already fixed; use the same fix (call `useT` once at the top).
3. **Type errors that predate this work** (`npx tsc --noEmit`): `TreatmentFeedback.tsx` (150), `ProblemForm.tsx`, `ProblemList.tsx` (`name`/`description` possibly undefined), `ProtocolAdmin.tsx` (missing `ProtocolType`), `ProtocolSelection.tsx`. None are in files from this session. Find out how the production build tolerates them.
4. **Patient Data Export, Option 2** (full patient book) and phone testing of the export.
5. **Knowledge search Phase B** is paused (`docs/Future/Knowledge-Search-Implementation-Plan.md`). Point documents are now in a stable layout, so the paths will not change under an index.
6. **Security claims.** The accurate statement today: server code gets an automated SAST scan before production (ESLint `eslint-plugin-security`), plus secret scan and `npm audit`; one OWASP ZAP dynamic scan and one manual review were done in September 2026. Not true: "tested to OWASP ASVS" (no mapping exists) and frontend SAST (`src/` is not scanned). Open items are in `docs/Future/Security-Hardening-Findings-and-Plan.md` (Findings 2, 6, 9).
7. **Legal changes handoff** (`docs/Future/Legal-Changes-Handoff.md`): the lawyer question and the activity-log gaps; "export is not logged" is now fixed for the treatment export.
8. **Cosmetic:** Chrome notes the API-key password field in Application Settings is not inside a `<form>`.
9. **Housekeeping:** many old local git branches (and the unused `point-documents-english`). The user must delete them; do not delete branches yourself.

## 8. How to start the next session
1. Read `CLAUDE.md`, `airules.md`, `Claude Style-Guide.md`, the memory index, then this file.
2. `git branch --show-current` and `git status`. The user may have changed things since 24/11/2026.
3. Ask the user which improvement from §6 or §7 to start with. Create a branch with `new-branch.ps1` only when asked.
