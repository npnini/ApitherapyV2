# Deploying to Production

Script: `scripts/deploy/deploy-prod.ps1` (run from repo root: `.\scripts\deploy\deploy-prod.ps1`). Runs unattended — no confirmation prompt. Target project: `apitherapy-c94a6` (Firebase alias `prod`). Live clinical operation — treat with the highest care.

## What it does, in order

1. **Check for extension config changes**: compares `extensions/*.env.prod` file timestamps against `.last_prod_deploy` (a gitignored marker file). If any `.env.prod` is newer, or no marker exists yet, extensions are included in this run.
2. **Sync BigQuery views** to production: `node scripts/deploy/sync-bq-views.js --deploy --stage_prod`.
3. **Clear caches**: removes `dist/`, `.firebase/`, `functions/lib/`.
4. **Build frontend**: `npm run build` (default Vite mode — not `--mode staging`).
5. **Build functions**: `npm run build` inside `functions/`.
6. **Deploy in a phased sequence** (explicitly ordered to avoid race conditions), all targeting `--project prod`:
   - **Phase A**: Firestore + Storage rules (`firebase deploy --only firestore,storage`), then CORS (`gcloud storage buckets update gs://apitherapy-c94a6.firebasestorage.app --cors-file=cors-production.json`).
   - **Phase B**: Extensions — only if step 1 detected a change.
   - **Phase C**: Cloud Functions.
   - **Phase D**: Hosting — deployed **last**, so a broken backend never goes live behind a working frontend.
7. On success, writes a fresh timestamp to `.last_prod_deploy`.

## Failure behavior

Wrapped in try/catch: if any phase fails, the script halts immediately and prints that Hosting was left untouched if Functions failed (since Hosting deploys last). There is no automatic rollback of already-applied phases (e.g. if Phase C fails, Phase A's rule changes are already live).

## Prerequisites

- `gcloud` CLI authenticated with access to `apitherapy-c94a6`.
- `firebase` CLI authenticated, with access to `apitherapy-c94a6` (alias `prod`).
- Local `functions/` and root dependencies installed.
- Staging has already been verified for this release (there is no automated gate enforcing this — it's a process expectation, not a script check).

## Preflight checks (manual, do before running)

- Confirm recent backups exist (see `docs/archive/prepare-prod-env.md` for the 3-tier backup strategy: daily Firestore snapshots, Storage object versioning, daily Storage disaster-recovery copy — all to `apitherapy-prod-backups`, 30-day retention).
- Confirm `cors-production.json` reflects the intended policy.
- Check whether any `extensions/*.env.prod` files changed recently — if so, expect Phase B to run.

## Post-deploy

- **Manual smoke test required** — no automated post-deploy check exists. `docs/operations/production-launch-followups.md` tracks this as an open item to formalize.
- Rollback: `firebase hosting:rollback` for hosting; Functions/Firestore/Storage rule rollback is manual (redeploy a previous known-good state) — there is no scripted rollback for those.
