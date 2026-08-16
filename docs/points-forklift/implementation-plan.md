# Points Forklift — Implementation Plan

This document is self-contained: each phase below has everything needed to implement and verify it, with no need to read anything else first. Background/rationale for these decisions lives in `design-decisions.md` in this same folder, if you want the "why" — it is not required reading to execute this plan.

**Per-phase execution order, every phase, no exceptions:** create branch → implement code → deploy & test on dev → deploy & test on staging → deploy & test on production → **only then** commit and push to git (merge to main) → move to the next phase. `deploy-staging.ps1`/`deploy-prod.ps1` deploy whatever is currently checked out locally — they are not tied to being on `main` — so each phase's branch gets deployed and validated directly on staging and production *before* merging, not after. `finish-feature.ps1` (commit/sync/merge to main) is therefore the **last** step of every phase. This means `main` only ever contains changes already proven working everywhere.

**Environment order within any phase that touches data**: Dev (local emulator) → Staging → Production — cheapest/safest first, production last. Staging project id `apitherapyv2` (credentials `service-account.json`), production project id `apitherapy-c94a6` (credentials `service-account-prod.json`), per `.firebaserc`.

## Progress tracker

Check off each phase once its `finish-feature.ps1` merge step is done (i.e. all 3 environments verified and merged to `main`). See each phase's own section for step-level checkboxes.

- [x] **Phase 1** — `cfg_point_groups` collection + admin screen
- [x] **Phase 2** — Point Configuration screen changes (selector, marking rules, camera-lock)
- [x] **Phase 3** — `cfg_acupuncture_points` migration script (M2)
- [x] **Phase 4** — L/R/S counter frontend changes
- [ ] **Phase 5** — `treatments` migration script (M3)
- [ ] **Phase 6** — `PointSideAnalysis` diagnostic tool update
- [ ] **Phase 7** — Cleanup (scope TBD)

---

## Phase 1 — `cfg_point_groups` collection + admin screen

Goal: create the new Firestore collection, a CRUD admin screen for it, and load the 19 seed group definitions. No dependency on anything else — foundational.

- [x] 1. `new-branch.ps1` to create the phase branch.
- [x] 2. Implement:
  - New Firestore collection **`cfg_point_groups`**. Document fields: `code` (string, e.g. `"SI"`, `"GV"`, `"HN-paired"` — unique, matches the spreadsheet's group codes), `name` (plain string, e.g. `"Small Intestine"` — not an i18n map), `description` (plain string), `type` (string enum: `"meridian"` | `"ex-point"`), `laterality` (string enum: `"Paired"` | `"Midline-front"` | `"Midline-back"` | `"Unilateral"` — these exact values/casing, matching the real spreadsheet data), `comment` (optional string), plus standard fields `status` (`'active'`|`'inactive'`), `reference_count` (number, starts `0`), `createdAt`/`updatedAt` via `serverTimestamp()`.
  - New admin CRUD screen, following the `MeasureAdmin.tsx` + `measureService.ts` pattern: list view + modal add/edit form, `addDoc`/`updateDoc` with `serverTimestamp()`, `logAction()` audit entry on create/update/delete, Delete button disabled (tooltip "Cannot delete: referenced by points") while `reference_count > 0`.
  - New `Sidebar.tsx` entry labeled "Point Grouping" in the Configuration section, positioned immediately **before** the existing "Points Configuration" button.
  - New `App.tsx` wiring: add `'admin_point_groups'` to the `View` union type, a `handlePointGroupingAdminClick` handler (`setCurrentView('admin_point_groups')`), pass it to `Sidebar` as a new prop, add a conditional render branch for the new screen — same pattern as the existing `admin_measures`/`admin_problems` branches.
  - New migration script under `/scripts` (M1): dry-run capable — defaults to dry-run, requires an explicit `--apply` flag to write for real, `--project=dev|staging|prod` selector (`clean-translations-pii.js`-style). Reads the 19 rows from `docs/points-forklift/production_point_side_analysis_2026-08-13.xlsx`'s `Point_Groups` sheet (columns: Code, Name, description, type, laterality, comment) and creates one `cfg_point_groups` document per row.
- [x] 3. Test locally: `npm run dev:all`, manually exercise the new admin screen (create/edit/delete a test group), confirm the Sidebar entry's position and role-gating match the other Configuration items.
- [x] 4. Run M1 against **dev**: dry-run and review its output → run for real (`--apply`) → verify: open the admin screen, confirm all 19 groups display with correct code/name/type/laterality.
- [x] 5. `deploy-staging.ps1` (deploys this branch's currently-checked-out code — not `main`) → run M1 against **staging**: dry-run → review → real run (`--apply`) → verify in the deployed staging admin screen.
- [x] 6. `deploy-prod.ps1` → run M1 against **production**: dry-run → review → real run (`--apply`) → verify in production.
- [x] 7. Confirm all 3 environments show the same 19 groups correctly.
- [x] 8. `finish-feature.ps1` — commit, sync, merge the branch to `main`. Only now, after all 3 environments are independently verified. Then move to Phase 2.

---

## Phase 2 — Point Configuration screen changes

Goal: let an admin assign a `Point_Grouping` to a point, and enforce marking rules (left/right normalization, midline centering, camera-lock) when placing it on the 3D model. Depends on Phase 1 (needs real `Point_Grouping` options to select from). **Must precede Phase 3's real (non-dry-run) execution**: legacy points needing manual fixes must be corrected through this screen before the bulk migration runs.

- [x] 1. `new-branch.ps1`.
- [x] 2. Implement, in `src/components/PointsAdmin.tsx` (point edit form) and `src/components/PointPlacementScene.tsx` (3D placement viewport):
  - **`Point_Grouping` selector**: required dropdown in the point edit form, populated from `cfg_point_groups` (Phase 1), storing the selected group's **document ID** (not its code string) on the point's new `Point_Grouping` field. Mandatory — the form can't be saved without a value.
  - **Marking-rule validation on save**, based on the selected group's `laterality`:
    - `"Paired"`: admin can click anywhere; on save, always normalize and store as the character's **Right** side (**negative** `positions.corpo.x`) — if the raw click produced positive `x`, flip its sign before saving (`y`/`z` unchanged), regardless of which side was actually clicked.
    - `"Midline-front"` / `"Midline-back"`: `positions.corpo.x` must be exactly `0`. If the click's resulting `x` isn't exactly `0`, **don't hard-error** — show a confirmation prompt asking whether to correct the marking to the exact midline (snap `x` to `0` if confirmed, `y`/`z` unchanged). Only save with nonzero `x` if the admin explicitly declines.
    - `"Unilateral"`: no restriction — save exactly as clicked, no normalization, no validation.
  - **Camera-lock behavior**, only for `Midline-front`/`Midline-back` groups (Paired/Unilateral keep fully free rotation):
    - Add a `ref` to `OrbitControls` in `PointPlacementScene.tsx` (currently has none).
    - Lock **both** `autoRotate` and manual `enableRotate` (currently `enableRotate={true}` unconditionally at line 154) — make both conditional on the point's `Point_Grouping` laterality. Keep `enablePan`/`enableZoom` on throughout.
    - Canonical front pose: camera `position=[0, 1.2, 3]`, `target=[0, 1, 0]` (already `PointPlacementScene`'s current default). Canonical back pose: `position=[0, 1.2, -3]`, `target=[0, 1, 0]` (Z-negated mirror, 180° azimuth flip around the same target).
    - Lock/snap triggers the moment laterality is known: immediately on modal open when editing a point that already has a `Point_Grouping`; the instant a `Midline-front`/`Midline-back` group is selected when creating/re-grouping a point (re-snap if the selection changes again).
  - **Error/UX message updates**: any existing bilateral-center error message referencing "mark on the left side" must be reworded to say **right** side, matching the reversed convention. No new error message is needed for the front/back rule — the camera-lock makes the wrong side physically unclickable; optionally keep a short explanatory tooltip near the locked viewport.
- [x] 3. Test locally against **dev** (already has Phase 1's 19 seed groups): create/tag one test point per laterality type (Paired, Midline-front, Midline-back, Unilateral) and verify each rule above — Paired always saves negative `corpo_x` regardless of click side; Midline off-center triggers the correction prompt and snaps to `x=0` on confirm; Unilateral saves exactly as clicked; camera locks to the correct pose for both midline groups with pan/zoom still working. Use this now-working screen to hand-correct any legacy points still flagged as needing fixes (re-check current data first — most known issues were already resolved during planning).
- [x] 4. `deploy-staging.ps1` → repeat the same manual verification on staging.
- [x] 5. `deploy-prod.ps1` → repeat the same manual verification on production.
- [x] 6. `finish-feature.ps1` — commit, sync, merge to `main`. Only now, after all 3 environments verified. Then move to Phase 3.

---

## Phase 3 — `cfg_acupuncture_points` migration script (M2)

Goal: backfill every existing point's `Point_Grouping` and correct `positions.corpo.x` on ~226 existing points, from the finalized spreadsheet. Depends on Phase 1; benefits from Phase 2 existing first (manual fixes go through the validated screen).

- [x] 1. `new-branch.ps1`.
- [x] 2. Implement a new migration script under `/scripts` (dry-run capable, defaults to dry-run, requires `--apply` to write for real, `--project=dev|staging|prod` selector), which for every row in `docs/points-forklift/production_point_side_analysis_2026-08-13.xlsx`'s per-point sheet (`production_point_side_analysis_`):
  - Looks up the row's `Point_Group` code (e.g. `"SI"`, `"GV"`, `"HN-paired"`) against `cfg_point_groups` (Phase 1) to resolve it to that group's **document ID**, and writes that ID into the point's `Point_Grouping` field (not the code string).
  - Writes the spreadsheet's `corpo_y`/`corpo_z` as-is into `positions.corpo.y/z`.
  - **`corpo_x` is computed by the script, not copied as-is from the spreadsheet** — based on the resolved group's `laterality`: `"Paired"` → if the spreadsheet's `corpo_x` is positive, flip it negative (Right); if already negative, leave it; `"Midline-front"`/`"Midline-back"` → force `0` regardless of the spreadsheet's value; `"Unilateral"` → use the spreadsheet's `corpo_x` exactly as given, no computation. (This removes any dependency on the spreadsheet's `corpo_x` already being hand-corrected for every Paired point — the script enforces the convention itself. Confirmed via a fresh check: 65 of 196 Paired points in the current spreadsheet still have the old positive/Left sign; this logic handles all of them correctly without requiring manual spreadsheet edits first.)
  - Applies the `code`/label corrections already identified: `NH5`→`HN5`, `DU20`→`GV20`, `SI18` label "Qimai"→"Quanliao" (plus any others present in the finalized spreadsheet).
  - Any row the script can't confidently resolve or apply (ambiguous group code, missing point, conflicting data) is **not** auto-corrected — write it to a punch-list output for the admin to fix by hand in Point Configuration (Phase 2's screen); skip that row rather than guessing.
- [x] 3. **Dev**: back up first (`firebase emulators:export <path>`) → dry-run and review → run for real (`--apply`) → manually verify — spot-check several points in Point Configuration and cross-check against the `PointSideAnalysis` diagnostic tool.
- [x] 4. **Staging**: back up first (`gcloud firestore export gs://apitherapyv2-staging-backups/ManualBackup/cfg_acupuncture_points-<timestamp> --collection-ids=cfg_acupuncture_points --project=apitherapyv2`, without `--async`) → dry-run → review → real run (`--apply`) → verify.
- [x] 5. **Production**: back up first (`gcloud firestore export gs://apitherapy-prod-backups/ManualBackup/cfg_acupuncture_points-<timestamp> --collection-ids=cfg_acupuncture_points --project=apitherapy-c94a6`, without `--async`) → dry-run → review → real run (`--apply`) → verify.
- [ ] 6. Restore, if ever needed: `gcloud firestore import gs://<bucket>/ManualBackup/cfg_acupuncture_points-<timestamp> --project=<id>`.
- [x] 7. `finish-feature.ps1` — commit, sync, merge the script into `main`. Only now, after all 3 environments verified. No app deploy anywhere in this phase — it's a script run directly against each environment's Firestore, no frontend/functions changes ship. Then move to Phase 4.

---

## Phase 4 — L/R/S counter frontend changes

Goal: replace the treatment execution R/L checkboxes and the old `stungPointIds`/`stungPointSides` model with Left/Right/Single numeric counters, and update every screen that displays stung points. Depends on Phase 1+3 (needs `Point_Grouping` resolvable to decide which counters to show). Deliberately placed before Phase 5: no dependency on the treatments migration having run, and the live app needs to already read/write the new structure before any historical data is converted.

- [x] 1. `new-branch.ps1`.
- [x] 2. Implement:
  - **New treatment data model**: replace `stungPointIds: string[]` + `stungPointSides?: Record<pointId,'L'|'R'>` (in `src/types/treatmentSession.ts`) with a single map `stungPoints: Record<pointId, { left: number; right: number; single: number }>` — every present pointId always has all three counters (defaulting to `0`); no separate ID array needed since the map's keys are the stung point IDs. Update `patient.ts`'s save path to write this structure.
  - **`TreatmentExecution.tsx`** — when a point is added to the stung-points rectangle, look up its `Point_Grouping`'s `laterality` (resolved via `cfg_point_groups`, same lookup as Phase 2):
    - `"Paired"`: show exactly **two** numeric counter boxes, labeled **L** and **R**, each a spinner-style numeric input (up/down arrows, and typeable directly). The **label sits to the left of its input box**. Leave **significant visual spacing** between the L box and the R box so they read as two clearly separate groups, not one control. Default `0` for both. Tooltip: "Left" / "Right".
    - `"Midline-front"` / `"Midline-back"` / `"Unilateral"`: show exactly **one** numeric counter box, labeled **S**, same spinner/typeable style, default `0`, tooltip "Midline-Unilateral". Never show L/R for these.
    - No point ever shows all three boxes at once.
  - **"Show Model" button** (Treatment History screen): add a tooltip reading "mark a treatment then click", shown on hover.
  - **`TreatmentHistory.tsx` Tabular View** — "Stings" column: each stung point renders as `"CODE-Y"`, where `Y` is built from whichever of `R`, `L`, `S` have a nonzero counter for that point, **in that order — R before L before S** (e.g. a Paired point stung both sides shows `"BL23-RL"`, right-only shows `"BL23-R"`, a Midline point shows `"CV4-S"`). A point with all counters at `0` isn't shown.
  - **`TreatmentHistory.tsx` List View** — stung points section: each point shown as `"code, label, L=x, R=y, S=z"` using that point's actual counter values, shown **uniformly for every point regardless of laterality** (unlike the input UI, which only shows the applicable subset — this is a read-only summary, so all three values including zeros keep the report format consistent).
  - **`PointsModelViewer.tsx`**: alongside the existing stung-points count, add "Total stings" = sum of Single+Left+Right across every stung point **in the specific treatment currently being displayed** (not the broader multi-treatment aggregate scope "Show Model" can otherwise show).
  - **`pointSide.ts`** (`formatPointCode`/`getSideLabel`): rework to read the new `{left, right, single}` shape instead of the old single `'L'|'R'` flag, producing the `"CODE-Y"` format above.
  - Also updated (not named above, but required to keep the app compiling/consistent once the data model and `pointSide.ts` signature changed): `PatientIntake.tsx` (the actual save path — accumulates and merges `stungPoints` counts across protocol rounds), `PostStingScreen.tsx` and `TreatmentSummary.tsx` (both render `formatPointCode` badges, using the compact `"CODE-Y"` format). Also deleted `scripts/generate_mock_data.cjs` (unused, wrote the old field shape).
- [x] 3. Test locally on **dev**: create a **new** treatment end-to-end — add a Paired point with different L/R counts, add a Midline point with an S count — confirm only the relevant boxes appear with the described layout, confirm the Tabular View suffix and List View line render correctly for both, confirm "Total stings" sums correctly, confirm the "Show Model" tooltip appears on hover.
- [x] 4. `deploy-staging.ps1` → repeat the same manual test (create a real test treatment) on staging.
- [x] 5. `deploy-prod.ps1` → repeat the same manual test on production.
- [x] 6. Confirm the app is live with full new-structure read/write support in all 3 environments — this must be true before Phase 5 runs, since Phase 5 converts historical data into this same structure and the app needs to already display it correctly everywhere.
- [x] 7. `finish-feature.ps1` — commit, sync, merge to `main`. Only now, after all 3 environments verified. Then move to Phase 5.

---

## Phase 5 — `treatments` migration script (M3)

Goal: convert every existing treatment document from `stungPointIds`/`stungPointSides` into the new `stungPoints: {left, right, single}` map, then remove the old fields. Highest-risk phase — full backup/verify/delete procedure required, per environment. Hard dependency on Phase 3 (needs every point's `Point_Grouping` resolved) and Phase 4 (frontend must already understand the new structure before old fields are deleted).

- [ ] 1. `new-branch.ps1`.
- [ ] 2. Implement a new migration script under `/scripts` (dry-run capable, defaults to dry-run, requires `--apply` to write for real, `--project=dev|staging|prod` selector), which for every document in `treatments`:
  - For each `pointId` in that document's `stungPointIds` array: if `stungPointSides[pointId]` exists (`'L'` or `'R'`), set that point's `left` or `right` counter to `1` respectively (the old model had no concept of counts, so any recorded side becomes a count of exactly 1); `single` stays `0`.
  - If `stungPointSides[pointId]` does **not** exist for that pointId: look up the point's `Point_Grouping` laterality (via `cfg_point_groups` — requires Phase 3 to have already backfilled every point's `Point_Grouping`). If `laterality = "Paired"`, default `left = 1` (`right`/`single` stay `0`). If `laterality` is `Midline-front`/`Midline-back`/`Unilateral`, default `single = 1` (`left`/`right` stay `0`).
  - Writes the resulting `stungPoints` map onto the treatment document — **without** removing `stungPointIds`/`stungPointSides` yet (separate step below, only after manual verification).
  - A separate script mode/flag (`--delete-old-fields`) removes `stungPointIds`/`stungPointSides` from already-migrated documents — run only after verification passes.
- [ ] 3. **Dev**: back up first (`firebase emulators:export <path>`) → dry-run → review → run for real **without** `--delete-old-fields` (`--apply` only) → manually verify — check Treatment History's Tabular View, List View, and "Show Model" 3D view for several migrated treatments, confirm "Total stings" sums correctly → only once verification passes, re-run with `--delete-old-fields` to remove the old fields.
- [ ] 4. **Staging**: back up first (`gcloud firestore export gs://apitherapyv2-staging-backups/ManualBackup/treatments-<timestamp> --collection-ids=treatments --project=apitherapyv2`, without `--async`) → same convert-without-deleting → verify → delete-old-fields sequence as dev.
- [ ] 5. **Production**: back up first (`gcloud firestore export gs://apitherapy-prod-backups/ManualBackup/treatments-<timestamp> --collection-ids=treatments --project=apitherapy-c94a6`, without `--async`) → same sequence.
- [ ] 6. Restore, if ever needed: `gcloud firestore import gs://<bucket>/ManualBackup/treatments-<timestamp> --project=<id>`.
- [ ] 7. `finish-feature.ps1` — commit, sync, merge the script into `main`. Only now, after all 3 environments are fully verified **including** the deletion step. No app deploy needed in this phase — Phase 4 already shipped and merged the reading code, live in all 3 environments, before this phase started.

---

## Phase 6 — update `PointSideAnalysis` diagnostic tool

Goal: simplify the audit tool now that `Point_Grouping` is the authoritative, always-populated source of truth, retiring the guesswork it stood in for. Deliberately last: this phase only technically depends on Phase 1 (`cfg_point_groups` existing) and Phase 3 (`Point_Grouping` backfilled everywhere), not on Phases 2/4/5 — but it's sequenced last anyway so the diagnostic/audit tool stays in its trusted current form throughout the riskiest phases (3 and 5), only simplified once the migration it helps audit is fully complete.

- [ ] 1. `new-branch.ps1`.
- [ ] 2. Implement, in `src/utils/pointSideAnalysis.ts` + `src/components/PointSideAnalysis.tsx`:
  - **Drop `meridian_prefix` entirely** (the regex-derived guess from `code`) — no longer needed now that every point has a mandatory, backfilled `Point_Grouping`.
  - **`corpo_side` column: unchanged** — still resolved from the sign of `positions.corpo.x` (`EPS_CORPO = 0.15` threshold, `+X = Left`), exactly as today.
  - **`expected_pairing` column**: resolve from the point's actual `Point_Grouping` → look up that group's `laterality` in `cfg_point_groups` (Paired/Midline-front/Midline-back/Unilateral), instead of guessing from the `PREFIX_PAIRING` table keyed by `meridian_prefix`. Retire `PREFIX_PAIRING` entirely; verify case-by-case during implementation whether the `CODE_OVERRIDES` table is still needed for any special-case points, rather than assuming it can also be dropped.
  - **`consistency_flag` and `reference_note` logic: unchanged** — keep exactly as today (still comparing `expected_pairing` against `corpo_side`, same flag text).
- [ ] 3. Test locally on **dev**: run the tool, confirm `expected_pairing` now matches each point's actual `Point_Grouping` laterality, confirm `corpo_side`/`consistency_flag`/`reference_note` behave identically to before (same flags raised for the same rows).
- [ ] 4. `deploy-staging.ps1` → spot-check the same on staging.
- [ ] 5. `deploy-prod.ps1` → spot-check the same on production. No data migration involved — pure diagnostic-tool code change.
- [ ] 6. `finish-feature.ps1` — commit, sync, merge to `main`. Only now, after all 3 environments verified. Then move to Phase 7.

---

## Phase 7 — Cleanup

Scope not yet defined — to be discussed and filled in later, once Phases 1–6 are complete and it's clear what's left to tidy up (e.g. leftover punch-list items, migration scripts/backups, anything deferred along the way). Placeholder for now.
