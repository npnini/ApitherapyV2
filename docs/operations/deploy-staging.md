# Deploying to Staging

Script: `scripts/deploy/deploy-staging.ps1` (run from repo root: `.\scripts\deploy\deploy-staging.ps1`). Runs unattended — no confirmation prompt. Target project: `apitherapyv2`.

## What it does, in order

1. **Sync BigQuery views** to staging: `node scripts/deploy/sync-bq-views.js --deploy --dev_stage`.
2. **Clear caches**: removes `dist/`, `.firebase/`, `functions/lib/`.
3. **Build frontend**: `npx vite build --mode staging`.
4. **Build functions**: `npm run build` inside `functions/`.
5. **Deploy**: `firebase deploy --only "hosting,functions,storage,firestore" --project apitherapyv2` — all four targets in one call (not phased, unlike production).
6. **Apply CORS**: `gcloud storage buckets update gs://apitherapyv2-staging-storage --cors-file=cors-staging.json`.

## Prerequisites

- `gcloud` CLI authenticated with access to the `apitherapyv2` project.
- `firebase` CLI authenticated (`firebase login`), with access to `apitherapyv2`.
- Local `functions/` and root dependencies installed (`npm install` in both).

## Preflight checks (manual, do before running)

- Confirm you intend to deploy hosting + functions + storage + firestore together — this script has no partial-deploy option.
- Confirm `cors-staging.json` reflects the intended CORS policy before it's applied.
- `$ErrorActionPreference = "Stop"` means the script halts on the first failing step, but there is no automatic rollback of steps already applied.

## Post-deploy

- No built-in smoke test — manually verify the staging URL (`apitherapyv2` Hosting) after deploy.
- No rollback automation. To roll back, redeploy a previous known-good build, or use `firebase hosting:rollback` for hosting specifically.
