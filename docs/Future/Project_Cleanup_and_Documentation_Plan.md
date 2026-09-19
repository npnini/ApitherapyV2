# ApitherapyV2 Repository Cleanup — Executable Plan

_Markdown source of truth for the cleanup plan. Supersedes the narrative-only `Project_Cleanup_and_Documentation_Plan.docx` (dated 2026-08-01) once this plan executes; the `.docx` will be regenerated from this file per Phase 1._

## Status (as of 2026-08-16)

**Phases 0-4 are complete**, committed and merged into `main` via branch `cleanup/repo-restructure`. **Phases 5-7 are intentionally paused** — not urgent, not abandoned. Resume them in a future session by picking up at Phase 5 below.

Beyond the original plan scope, this pass also: recovered the local emulator database from a real data-loss incident (points-forklift changes had never been exported from a live local emulator — see `docs/operations/sync-local-emulator.md`), fixed a matching gap in `scripts/dev/sync-firestore.js`'s `COLLECTIONS` list (`cfg_point_groups`, `app_audit_log` were silently skipped), created a named checkpoint backup (`emulator-data-backups/checkpoint-Phase6-PointSideAnalysisUpdate-20260816-142742/`), and moved `firestore.rules`/`firestore.indexes.json` into `config/firestore/` (with `firebase.json` updated accordingly) since those two are genuinely Firestore-specific — `storage.rules`, `cors-*.json`, and `service-account*.json` were left at root for a future pass, since they're either broader-than-Firestore or tied to root-relative script conventions that would need their own review.

## Context

`Project_Cleanup_and_Documentation_Plan.docx` (dated 2026-08-01) is a read-only assessment of the repo — findings and a proposed target layout, but not a concrete step-by-step execution plan. Since it was written, ~2 weeks of work happened (points-forklift M1–M3 migrations, an Xbot 3D-model removal, one docs-archival commit). This planning session re-verified every claim in that document against the actual current tree using three parallel read-only audits, found the diagnosis is still mostly correct but several specifics have drifted (some candidate files already deleted, one flagged as orphaned is actually a false positive), and confirmed the open decisions directly with the user across two review rounds.

Goal of this plan: replace the old document with something a future execution session can follow phase-by-phase without re-discovering the repo, while keeping every risky step small, reversible, and gated.

**Decisions locked in for this plan (user-confirmed):**
- `users.json`: simple removal from the current tree + `.gitignore`, no git-history rewrite (residual exposure in history is an accepted risk, not to be pursued unless revisited later).
- Documentation format: Markdown under `docs/` is the source of truth going forward; `Project_Cleanup_and_Documentation_Plan.docx` gets regenerated from it rather than hand-edited.
- Root `PastMDocs/` (32 files): move all of it into `docs/archive/` in Phase 1 without filtering first; a dedicated content audit happens later (Phase 7) to decide what's actually worth keeping.
- Points-forklift migration is complete and successful — all its pre-migration safety snapshots are no longer needed and should be deleted, not retained.
- `CLAUDE.md` typos/inaccuracies (script filename mismatches, etc.) can be corrected directly as part of this plan — no separate sign-off round needed for that class of fix.

**Safety gates that apply to every phase below** (carried over from the old plan, still valid):
- Never delete solely because a file has no import reference — re-check package scripts, direct CLI invocation, Firebase conventions, and docs links immediately before removal (static scans go stale, as this session's re-audit proved).
- Small commits, grouped by category (docs, generated state, backups, scripts, source, folder moves) — not one giant commit.
- After every source removal: frontend build, `functions` build, and an emulator smoke start.
- Per this project's own rules: no new branches, commits, script/deploy runs without the user's explicit go-ahead at each step — this plan is the roadmap, not a standing authorization to execute.

---

## Phase 0 — Baseline (already satisfied) ✅ done

The old plan's Appendix A flagged unreconciled working-tree state (a modified `prepare-prod-env.md`, two deleted migration scripts, an untracked `gsutil` doc) as a blocker. `git status` is clean today — those were resolved by subsequent commits. No action needed; just confirm `git status` is clean immediately before Phase 1 starts, since this plan may not execute immediately.

---

## Phase 1 — Documentation correction & consolidation ✅ done

1. **Consolidate the archive.** Rename `docs/PastMDocs/` → `docs/archive/` (it currently only holds the points-forklift subfolder from the recent commit). Then `git mv` the entire root-level `PastMDocs/` (32 files: 20 loose docs, the `3D_Migration/` subfolder, two consent templates) into `docs/archive/` as well, so there is one archive location, not two. Do not filter yet — that's Phase 7.
2. **Create the rest of the target hierarchy**: `docs/functional/`, `docs/operations/`, `docs/architecture/` (currently none of these exist — only the archive folder does).
3. **Rewrite `README.md`.** It currently claims React 19 and a Gemini API (`@google/genai`) integration; actual `package.json` shows React 18.2 and no generative-AI dependency anywhere (root or `functions/`). Correct the stack description and **remove the Gemini feature claims entirely** — not a roadmap item, just inaccurate content to delete.
4. **Fix the stale command reference in `CLAUDE.md`.** It documents `deploy_staging.ps1` / `deploy_prod.ps1` (underscores); the actual files are `deploy-staging.ps1` / `deploy-prod.ps1` (hyphens). Straightforward typo fix — correct it directly (note: Phase 4 will touch this section again once the scripts physically move).
5. **Audit `airules.md` and `Claude Style-Guide.md` for accuracy.** `CLAUDE.md` references both by root-relative filename as the project's coding conventions, but they may no longer reflect actual current practice. Review both against the real codebase; where they've drifted, update them (this may surface rule changes worth calling out separately before applying).
6. **Dispose of three root planning docs:**
   - `env_separation_implementation_plan.md` — describes a 3-tier cloud project model (`apitherapy-dev/-stage/-prod`) that was never built; the actual, intentional setup is 3 operating contexts / 2 cloud projects (local dev, `apitherapyv2` staging, `apitherapy-c94a6` production), which the user confirmed is the desired end state. This doc served its purpose and can be **deleted outright**, not archived.
   - `gsutil-to-gcloud-storage-verification-plan.md` — its own executive finding says the migration is already done. Archive to `docs/archive/`, tagged **completed**.
   - `prepare-prod-env.md` — checklist is almost entirely `[x]`; only DNS/SPF/DKIM verification and a webhook URL update remain open. Extract those 2-3 open items into a new `docs/operations/` task note, then archive the rest to `docs/archive/` as **completed**.
7. **Write the operations handbook** under `docs/operations/`, sourced from verified current behavior (not memory): `environments.md` (2-project matrix: local emulators / `apitherapyv2` staging / `apitherapy-c94a6` prod), `deploy-staging.md` and `deploy-production.md` (both scripts currently run unattended with no confirmation prompt; prod has phased rule→extensions→functions→hosting deploy gated by `.last_prod_deploy`), `testing.md` (current state: no test runner configured — see Phase 5), `script-catalog.md` (see Phase 4's categorized script list).
8. **Regenerate `Project_Cleanup_and_Documentation_Plan.docx`** from this Markdown file once Phase 1 content stabilizes. Establish this as the pattern going forward (Markdown edited directly, docx regenerated on request) rather than doing the reverse.

---

## Phase 2 — Generated/ignored state cleanup ✅ done

1. Delete `firestore-debug.log` (26 MB, actively growing) and `pubsub-debug.log` (0 bytes) — both gitignored, both regenerate on next emulator run.
2. Clear `dist/` and `.firebase/` cache — both gitignored, both regenerate on next build/deploy.
3. Confirm `emulator-data/` as the one canonical live import/export target (matches `firebase.json`'s emulator config convention).
4. **Delete `.firebase-exports/pre-M2-dev-20260815-214247/`.** The points-forklift migration completed successfully end-to-end (M1 through M3 have all landed); this pre-migration rollback snapshot is no longer needed.
5. **Investigate, then decide keep/discard/relocate for each:** `.FullName` (46 bytes, purpose unknown), `skills-lock.json` (purpose/generator unknown), `scratch/migrate_ext_envs.cjs` (a migration script sitting outside `scripts/` — determine if superseded or needs relocating into `scripts/migrations/`), `tools/` (empty directory — confirm intentional placeholder vs. leftover). Don't dispose of any of these without first confirming what they are.

---

## Phase 3 — Safe removals (re-verified orphaned files) ✅ done

These 7 files were re-confirmed orphaned *today*, not just as of the Aug-1 scan (re-grepped whole repo, excluding `node_modules`):

- `src/components/TreatmentExecution.module.css.bak`
- `src/components/PointsAdmin_new_styles.css`
- `src/components/MeasureAdmin/MeasureAdmin.module.css` (path changed since Aug 1 — component now imports `../PointsAdmin.module.css` and `./MeasureForm.module.css` instead)
- `src/components/MeasureAdmin/MeasureList.module.css` (no corresponding `MeasureList.tsx` exists at all)
- `src/data/mockProtocols.ts`
- `src/hooks/useProblemForm.ts`
- `src/hooks/useTreatments.ts`

Plus, per the user's decision: `git rm users.json` and add `users.json` to `.gitignore` (accepted residual risk: still recoverable from git history).

Remove in 2-3 small batches, re-grep immediately before each batch (don't trust this list if much time has passed), and run frontend build + functions build + emulator smoke start after each batch.

**Already resolved, no action needed:** `BodyScene.tsx.bak`, `src/data/apipunctureData.ts`, and `src/utils/universalPointMapper.ts` were all already deleted on 2026-08-11 in the Xbot-removal commit (`bc3d7f2`).

**Correction (2026-08-16, post-Phase-4):** `metadata.json` (root) was reported here as "actively read by `scripts/start-dev.js`, retain" — that was itself a false positive, caused by a substring match against `firebase-export-metadata.json` (a different, auto-generated file). The real root `metadata.json` has zero references anywhere in the codebase and looks like vestigial browser-extension-manifest content unrelated to this app. Not removed yet — flagged as a real candidate for a future small cleanup pass, along with `storage-lifecycle.json` (also zero references anywhere).

**False positives — explicitly retain, do not touch:** `src/types/questionnaire.d.ts` is live and imported by 8 files — the old plan's candidate list named a nonexistent `PatientIntake/questionnaire.d.ts`, likely confused with this one. `PatientIntake/config.ts` never existed at any point in git history — drop it from consideration entirely. `PatientIntake/index.ts` (barrel export) is unused (`App.tsx` imports the component directly, bypassing it) but low-confidence/low-risk — leave it pending a deliberate API/type review rather than bundling it into this removal batch.

---

## Phase 4 — Root & scripts restructure ✅ done

1. Reorganized the 31 flat files in `scripts/` into subfolders by function:
   - `scripts/dev/`: `auto-save-emulator.js`, `start-dev.js`, `sync-firestore.js`, `impersonate-user.js`
   - `scripts/deploy/`: `sync-bq-views.js`, `backfill-bq-prod.ps1`, plus `deploy-staging.ps1`/`deploy-prod.ps1` moved from root (see below)
   - `scripts/migrations/`: `migrate-points-grouping.js`, `migrate-treatments-sting-counters.js`, `migrateUrlsToPaths.cjs`, `migrate_patient_ages.cjs`, `migrate_problems_integrity.js`, `migrate_referential_integrity.js`, `seed-point-groups.js`, `removeXbotCoordinates.cjs`, `fixStorageMetadata.cjs`, `fix_mock_measures.cjs`, `fix_treatment_ids.cjs`, `updatePointDescriptions.cjs`, `cleanup_measure_D59QXsAzO3jZ3iBcZF31.cjs`, `clean-translations-pii.js`, and `migrate_ext_envs.cjs` (relocated out of the gitignored `scratch/` folder — confirmed a real, purposeful script, not throwaway)
   - `scripts/diagnostics/`: `check-status.js`, `check-unmigrated.js`, `compute_document_sizes.cjs`, `inspect-points.js`, `inspect_data_structure.cjs`, `list-storage.cjs`, `list-synced-users.js`, `peekData.cjs`, `probe_config.cjs`
   - `scripts/fixtures/`: `mock_sweep_data.cjs`, `clear-collections.js`
   - `refactor_css_colors.py` — one-time refactor already applied, moved to `docs/archive/` instead of an active `scripts/` subfolder.
2. **Moved `deploy-staging.ps1`, `deploy-prod.ps1`, `export_emulators.ps1`, `finish-feature.ps1`, and `new-branch.ps1` from root into `scripts/deploy/`.** `CLAUDE.md`'s Commands section updated to reference the new `scripts/deploy/` paths.
3. Updated every other reference: `package.json` scripts, `docs/operations/script-catalog.md`, deploy scripts' internal `sync-bq-views.js` cross-reference, and 8 scripts' own stale usage-comment paths. Found and fixed two real breakage risks: 11 scripts used `__dirname`-relative paths that needed an extra `'..'` since they moved one directory deeper, and `export_emulators.ps1` used `$PSScriptRoot` (which would've pointed at `scripts/deploy/` instead of repo root) — switched to resolving from the invoking shell's CWD instead. Validated with a real `npm run dev:all` run (not just syntax checks) — port cleanup, functions build, and emulator startup all passed via the new paths.

**Addendum (same day, post-Phase-4):** `firestore.rules` and `firestore.indexes.json` — the two genuinely Firestore-specific config files at root — moved into `config/firestore/`, with `firebase.json`'s `"rules"`/`"indexes"` paths updated accordingly and validated via a real emulator start. `storage.rules`, `cors-production.json`, `cors-staging.json`, and `service-account*.json` were deliberately left at root: `storage.rules` is Storage not Firestore, the `cors-*.json` files are Storage CORS configs, and `service-account*.json` are broad credentials used across Auth/Firestore/Storage/BigQuery — none of them fit under a "firestore" folder, and grouping them properly is its own future decision.

---

## Phase 5 — Test foundation (separate, lower-priority initiative) ⏸ paused, resume here

Confirmed still true today: no test runner is configured anywhere (`package.json` has no `test` script, no `vitest`/`jest`/`@playwright/test` dependency; `functions/package.json` has `firebase-functions-test` installed but wired to nothing). `AutomatedTestingPlan.md` (last touched 2026-04-29) is still just a proposal — its own "Next Steps" step 1 is still "install `@playwright/test`," unchanged since it was written.

**`AutomatedTestingPlan.md` is retained as-is** — explicitly kept (not archived, not deleted) as the reference document for this future testing initiative. This is real work but orthogonal to tree cleanup — track separately, don't let it block Phases 1-4.

---

## Phase 6 — Governance (not urgent, deferred) ⏸ paused

Once Phases 1-4 land: assign doc/script ownership, set an archive review cadence, and decide whether to add CI (none exists today — no `.github/workflows/`, deployment is fully manual via the two PowerShell scripts with no confirmation prompts). Explicitly low priority — revisit whenever it becomes relevant, no timeline attached.

---

## Phase 7 — Archive content audit (user-requested closing step) ⏸ paused

After Phase 1 has bulk-moved root `PastMDocs/` + the existing `docs/PastMDocs/points-forklift/` content into `docs/archive/` (~34 files total), do a detailed pass: for each file, decide keep-as-reference / extract-into-active-docs / delete.

Also revisit at this point: whether the `users.json` git-history exposure (left in place per Phase 3's "simple removal" choice) needs a full history purge, if risk tolerance changes later.

---

## Verification per phase

- **Phase 1**: docs render/link correctly, README's stack claims match `package.json`, regenerated `.docx` matches the Markdown source.
- **Phase 2**: clean `git status`; `npm run dev:all` still starts emulators cleanly against `emulator-data/`.
- **Phase 3**: `npm run build` (frontend) and `functions`' `npm run build` both succeed after each batch; emulator smoke start; spot-check the affected UI areas (Measure admin, points admin, patient intake).
- **Phase 4**: every `package.json` script and documented command resolves to its new path; a dry run of each moved deploy/migration script confirms correct relative paths before any real deploy is attempted.
- **Phase 5/6**: out of scope for this cleanup's own verification — tracked as their own initiatives.
