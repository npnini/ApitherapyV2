# Script catalog

`scripts/` is organized into `dev/`, `deploy/`, `migrations/`, `diagnostics/`, `fixtures/`. All PowerShell scripts under `scripts/deploy/` must be run with the repo root as the working directory (e.g. `.\scripts\deploy\deploy-staging.ps1`) — none of them change directory internally, so their relative paths (`dist`, `.firebase`, `functions/lib`, `cors-*.json`, `.last_prod_deploy`, `extensions/*.env.prod`) resolve against wherever you invoke them from.

## Dev

| Script | Path | Purpose |
|---|---|---|
| `auto-save-emulator.js` | `scripts/dev/auto-save-emulator.js` | Periodically snapshots emulator state (invoked via `npm run emulators:autosave`). |
| `start-dev.js` | `scripts/dev/start-dev.js` | Local dev orchestrator (invoked via `npm run dev:all`); force-kills processes on emulator ports, builds `functions`, starts emulators. |
| `sync-firestore.js` | `scripts/dev/sync-firestore.js` | Invoked via `npm run sync-data`. Full sync from live staging into the local emulator — see `docs/operations/sync-local-emulator.md`. |
| `impersonate-user.js` | `scripts/dev/impersonate-user.js` | Dev helper for impersonating a user during local testing. |

## Deploy

| Script | Path | Purpose |
|---|---|---|
| `deploy-staging.ps1` | `scripts/deploy/deploy-staging.ps1` | See `docs/operations/deploy-staging.md`. |
| `deploy-prod.ps1` | `scripts/deploy/deploy-prod.ps1` | See `docs/operations/deploy-production.md`. |
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
