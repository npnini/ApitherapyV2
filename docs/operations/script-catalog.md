# Script catalog

`scripts/` is organized into `dev/`, `deploy/`, `migrations/`, `diagnostics/`, `fixtures/`. All PowerShell scripts under `scripts/deploy/` must be run with the repo root as the working directory (e.g. `.\scripts\deploy\deploy-staging.ps1`) — none of them change directory internally, so their relative paths (`dist`, `.firebase`, `functions/lib`, `cors-*.json`, `.last_prod_deploy`, `extensions/*.env.prod`) resolve against wherever you invoke them from.

## Dev

| Script | Path | Purpose |
|---|---|---|
| `auto-save-emulator.js` | `scripts/dev/auto-save-emulator.js` | Periodically snapshots emulator state (invoked via `npm run emulators:autosave`). |
| `save-emulator-data.js` | `scripts/dev/save-emulator-data.js` | Invoked via `npm run save-emulator-data`, in a second terminal while the emulators are running. Exports the live emulator state into `emulator-data/` (loaded by the next `npm run dev:all`) and keeps a recovery copy in `emulator-data-manual/`. Retries up to 3 times and recovers the known Windows export-rename failure; if every attempt fails, both folders are left unchanged. |
| `start-dev.js` | `scripts/dev/start-dev.js` | Local dev orchestrator (invoked via `npm run dev:all`); force-kills processes on emulator ports, builds `functions`, starts emulators. |
| `sync-firestore.js` | `scripts/dev/sync-firestore.js` | Invoked via `npm run sync-data`. Full sync from live staging into the local emulator — see `docs/operations/sync-local-emulator.md`. |
| `impersonate-user.js` | `scripts/dev/impersonate-user.js` | Dev helper for impersonating a user during local testing. |

## Deploy

| Script | Path | Purpose |
|---|---|---|
| `deploy-staging.ps1` | `scripts/deploy/deploy-staging.ps1` | See `docs/operations/deploy-staging.md`. |
| `deploy-prod.ps1` | `scripts/deploy/deploy-prod.ps1` | See `docs/operations/deploy-production.md`. |
| `rules-test-check.ps1` | `scripts/deploy/rules-test-check.ps1` | Runs `tests/security-rules/` (Firestore/Storage rules regression tests) against the local emulator via `@firebase/rules-unit-testing`. Called from `deploy-staging.ps1` (gates the rule-deploy steps) and `finish-feature.ps1` (blocking, before `deploy-prod.ps1`). Never wired into `deploy-prod.ps1` directly. |
| `sync-bq-views.js` | `scripts/deploy/sync-bq-views.js` | Syncs BigQuery views; invoked by both deploy scripts with `--deploy` + a `--dev_stage`/`--stage_prod` flag. |
| `backfill-bq-prod.ps1` | `scripts/deploy/backfill-bq-prod.ps1` | BigQuery backfill for production. |
| `export_emulators.ps1` | `scripts/deploy/export_emulators.ps1` | Exports local emulator state to `emulator-data/`, recovering from the known Windows export-rename failure automatically. Resolves paths from the invoking shell's CWD (must be repo root), not its own script location. |
| `finish-feature.ps1` | `scripts/deploy/finish-feature.ps1` | Commits, pushes, and merges the current feature branch into `main`. |
| `new-branch.ps1` | `scripts/deploy/new-branch.ps1` | Creates and switches to a new branch off latest `main`. |

## Migrations (one-off or repeatable data changes — **write access**, treat with care)

| Script | Path |
|---|---|
| `migrate-points-grouping.js` | `scripts/migrations/migrate-points-grouping.js` |
| `migrate-treatments-sting-counters.js` | `scripts/migrations/migrate-treatments-sting-counters.js` |
| `migrateUrlsToPaths.cjs` | `scripts/migrations/migrateUrlsToPaths.cjs` |
| `migrate_patient_ages.cjs` | `scripts/migrations/migrate_patient_ages.cjs` |
| `migrate_problems_integrity.js` | `scripts/migrations/migrate_problems_integrity.js` |
| `migrate_referential_integrity.js` | `scripts/migrations/migrate_referential_integrity.js` |
| `seed-point-groups.js` | `scripts/migrations/seed-point-groups.js` |
| `removeXbotCoordinates.cjs` | `scripts/migrations/removeXbotCoordinates.cjs` |
| `fixStorageMetadata.cjs` | `scripts/migrations/fixStorageMetadata.cjs` |
| `fix_mock_measures.cjs` | `scripts/migrations/fix_mock_measures.cjs` |
| `fix_treatment_ids.cjs` | `scripts/migrations/fix_treatment_ids.cjs` |
| `updatePointDescriptions.cjs` | `scripts/migrations/updatePointDescriptions.cjs` |
| `cleanup_measure_D59QXsAzO3jZ3iBcZF31.cjs` | `scripts/migrations/cleanup_measure_D59QXsAzO3jZ3iBcZF31.cjs` |
| `clean-translations-pii.js` | `scripts/migrations/clean-translations-pii.js` |
| `translate-points-he-to-en.js` | `scripts/migrations/translate-points-he-to-en.js` (added 2026-10-01): fills the English of `cfg_acupuncture_points` `description` / `longText` with a Google Translate translation of the Hebrew, where Hebrew exists and English is empty (`--overwrite` to replace English). `--project=dev\|staging\|prod`; a review run writes a report to `scratch/`, then `--apply --from=<report>` writes exactly the reviewed translations (rows changed since the report are skipped). `--export` writes the same file with empty `enNew` and calls no API, for translating elsewhere and applying the same way. `--collection=protocols` (added 2026-10-01) does `cfg_protocols` instead: `description` and `rationale` always (existing English replaced), `name` only where its English is empty. |
| `version-upgrade.js` | `scripts/migrations/version-upgrade.js` (added 2026-11-19): the version-upgrade items, each idempotent, dry run unless `--apply`. `--project=dev\|staging\|prod` plus `--phase=1` or `--items=U1,U2`. **U1**: users without `createdTimestamp` get it from Auth creation time, else their earliest patient's `createdTimestamp`, else the run time; `updatedTimestamp` = run time for every written user. **U2**: copies every file directly under `App_config/` to `App_config/patient_documents/` (metadata and download token kept), verifies each copy, points the consent/instructions template paths in `cfg_app_config/main` to the copies, then deletes the originals; creates the `App_config/user_documents/.keep` placeholder. Run from the repo root, **after** the app version is deployed. Per-item JSON report in `scratch/version-upgrade/` (gitignored). **U3** (phase 2): `plan = free` for every user without a plan; roles are not changed (a role other than caretaker/admin/superadmin is only reported). **U4** (phase 2): creates `cfg_app_config/userTerms` as `{ versions: {} }` (no `currentVersion`) if missing — the User Terms check stays off until the superadmin publishes the first version. Run phase 2 after deploying functions, rules and app of the Registration/Roles/User Terms release. |
| `reorganize-point-documents.js` | `scripts/migrations/reorganize-point-documents.js` (added 2026-11-23): moves every point document into a language folder, `Points/<id>/<ts>_<name>` (and `Points/new/…`) → `Points/<id>/<lang>/<ts>_<name>`, where `<lang>` is the key of the point's `documentUrl` map; an old single-string `documentUrl` is treated as `--legacy-lang` (default `he`). Per file: copy and verify → update Firestore (transaction, only if the value is unchanged) → delete the original. Shared paths, missing files, external URLs and target conflicts are only reported; a point's `imageURL` counts as a reference; unreferenced files under `Points/` are listed and not deleted, unless `--delete-unreferenced` is given (on production a real `--apply` run also needs `--confirm-prod-delete`; dry run lists "would delete"; only files older than `--min-age-days`, default 7; nothing is deleted when the run met errors, conflicts or unreadable values). The report also lists empty folders (placeholder objects) and top-level `Points/` folders that are not a point id; `--delete-empty-folders` removes the empty placeholders (same production rule). Idempotent. `--project=dev\|staging\|prod`, dry run unless `--apply`, `--limit=N` for a small first test. Report in `scratch/reorganize-point-documents/` (gitignored). Part B of `docs/Future/Entity-Documents-Cleanup-Plan.md`, points only. |
| `convert-docx-to-pdf.ps1` | `scripts/migrations/convert-docx-to-pdf.ps1` (added 2026-11-23): converts every `.docx` in `scratch\point-docs-en\docx` to a PDF with the same base name in `scratch\point-docs-en\pdf`, using Microsoft Word (hidden, COM automation; files opened read-only, never changed). Re-runnable (skips existing PDFs; `-Force` converts again), `-Limit N` for a first test, per-file errors listed at the end, report `scratch\point-docs-en\convert-report.json`. Word must be installed and closed. Step 3 of importing the English point documents; step 4 uploads the PDFs. **Known issue (23/11/2026):** on the main dev PC (Word 16.0.20625) the PowerShell/COM run opens the file and then hangs in the save/export call (both `-Method Export` and `-Method SaveAs`), while Word's own Save as PDF works. Fallback: `scripts/migrations/convert-docx-to-pdf-macro.bas`, a VBA module that does the same conversion inside Word (Alt+F11, import, run `ConvertFirstFive`, then `ConvertAll`). |
| `import-point-documents.js` | `scripts/migrations/import-point-documents.js` (added 2026-11-23): imports English point documents from a folder of PDFs named `<code> - <label>.pdf` (made by `convert-docx-to-pdf-macro.bas`). Review stage (default, changes nothing): matches each file to a point by code (aliases in brackets and DU/GV, SJ/TW/TE, KID/KI, LIV/LR/LV treated as equal; the label is only a check) and writes a report to `scratch/import-point-documents/`. `--apply --from=<report>` then uploads exactly the reviewed matches to `Points/<id>/en/<ts>_<name>.pdf` and sets `documentUrl.en` (transaction; `documentUrl.he` untouched; `updatedAt` set). Ambiguous, unmatched and duplicate files are not uploaded; `--map=<json>` resolves them by hand (a file can map to one point id or a list of ids); a point that already has an English document is skipped unless `--replace`. `--project=dev\|staging\|prod`, `--limit=N`. |
| `migrate_ext_envs.cjs` | `scripts/migrations/migrate_ext_envs.cjs` (moved here from the gitignored `scratch/` folder during Phase 4; a real, purposeful dev→stage extension-config rewriter, not throwaway scratch material) |

## Diagnostics (read-only inspection)

| Script | Path |
|---|---|
| `check-status.js` | `scripts/diagnostics/check-status.js` |
| `check-unmigrated.js` | `scripts/diagnostics/check-unmigrated.js` |
| `compute_document_sizes.cjs` | `scripts/diagnostics/compute_document_sizes.cjs` |
| `inspect-points.js` | `scripts/diagnostics/inspect-points.js` |
| `inspect_data_structure.cjs` | `scripts/diagnostics/inspect_data_structure.cjs` |
| `list-storage.cjs` | `scripts/diagnostics/list-storage.cjs` |
| `list-synced-users.js` | `scripts/diagnostics/list-synced-users.js` |
| `peekData.cjs` | `scripts/diagnostics/peekData.cjs` |
| `probe_config.cjs` | `scripts/diagnostics/probe_config.cjs` |

## Fixtures / mock data

| Script | Path |
|---|---|
| `mock_sweep_data.cjs` | `scripts/fixtures/mock_sweep_data.cjs` |
| `clear-collections.js` | `scripts/fixtures/clear-collections.js` — **⚠️ does not target the local emulator.** It initializes the Admin SDK with no `FIRESTORE_EMULATOR_HOST` override, so it connects straight to whatever real project `service-account.json` points to (currently staging, `apitherapyv2`) and permanently deletes `treatments`, `measured_values`, `patients`, `patient_medical_data`, `questionnaire_responses`, `feedback_sessions` there. Do not use this to "clear local data" — see `docs/operations/sync-local-emulator.md` for the safe way to get a clean local emulator. |

## Archived (no longer an active script)

- `refactor_css_colors.py` — a one-time refactor already applied; moved to `docs/archive/refactor_css_colors.py`.

---

**Path-depth note:** every script under `scripts/<category>/` that loads `service-account.json`, `.env.local`, or `point_descriptions_bilingual.json` via `__dirname`-relative paths uses `path.join(__dirname, '..', '..', '<file>')` (two levels up to reach the repo root) — this was updated during the Phase 4 restructure when scripts moved one directory deeper than before. Scripts that instead resolve paths via `process.cwd()` (e.g. `start-dev.js`, `sync-firestore.js`, `auto-save-emulator.js`) didn't need any change, since `process.cwd()` reflects wherever `npm run ...` was invoked from (repo root), not the script file's own location.

**Owner / last-validated / retirement status** columns are intentionally not yet filled in — this catalog currently documents *what exists and roughly what it does*, not usage history. Populating ownership and validation dates is future work, not part of this cleanup pass.
