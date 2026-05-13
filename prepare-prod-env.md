# Production Environment Preparation Checklist

This document tracks all tasks required to safely move the Apitherapy application from Staging (`apitherapyv2`) to Production (`apitherapy-prod`).

## 1. Core Infrastructure & Security (Console Tasks)
*Establish the cloud foundation.*

- [x] **Firestore Database**: Initialized in `me-west1`.
- [x] **Firestore Security Rules**: Deployed.
- [x] **Firestore Indexes**: Deployed.
- [x] **Storage Bucket**: Initialized in `me-west1`.
- [x] **Storage Security Rules**: Deployed.
- [x] **BigQuery Dataset**: Created `apitherapy_clinical_analytics_prod` in `me-west1`.
- [x] **Web App Registration**: Register `Apitherapy-Prod-Web` in Firebase Console and save the `firebaseConfig`.
- [x] **OAuth Client ID**: Create a new production-specific OAuth 2.0 Client ID in Google Cloud Console.
    - Authorized origins: `https://apitherapy.beelive.biz`
    - Redirect URIs: `https://apitherapy.beelive.biz/__/auth/handler`
- [x] **Authorized Domains**: Add `apitherapy.beelive.biz` to Firebase Auth settings.
- [x] **Hosting Domain**: Connect `apitherapy.beelive.biz` in Firebase Hosting and update DNS records (A/CNAME).
- [x] **App Check**: Register web app with reCAPTCHA v3 (Set to 'Monitor' mode initially).
- [x] **Budget Alerts**: Set up budget in Billing Console with alerts at 50%, 90%, 100%.

## 2. Environment Configuration (Code Tasks)
*Prepare the codebase for the production environment.*

- [x] **Extension Configs**: Created `.env.prod` files for all 8 BigQuery extensions.
- [x] **Deployment Script**: Created automated `deploy-prod.ps1` with BQ sync and extension logic.
- [x] **BigQuery Sync Script**: Refactored `sync-bq-views.js` to handle Stage -> Prod pipeline.
- [x] **2.4. BigQuery Dataset Logic**: Update `functions/src/index.ts` to dynamically switch between `stage` and `prod` datasets based on `GCLOUD_PROJECT`.
- [x] **Frontend Config**: Create `.env.production` at project root with production `firebaseConfig` (VITE_ prefixed).
- [x] **Hosting Config**: Add security headers and SPA rewrite rules to `firebase.json`.
- [x] **Code Cleanup**: Remove `console.log` and `debugger` or gate them behind `import.meta.env.DEV`.

## 3. Data Migration (Staging -> Prod)
*Move essential data before the software goes live.*

- [x] **Auth Migration**: 
    - [x] `firebase auth:export users.json --project apitherapyv2`
    - [x] `firebase auth:import users.json --project prod`
- [ ] **Data Migration (Isolated)**:
    - [x] **One-time Setup** — Grant Prod Firestore SA access to the existing prod storage bucket (reads from `.env.production`):
        `.\scripts\setup-migration-permissions.ps1`
    - [ ] **Run Migration** — Exports Staging, downloads locally, uploads & imports to Prod:
        `.\scripts\migrate-stage-to-prod.ps1`
    > Firestore backup lands in `gs://apitherapy-c94a6.firebasestorage.app/backups/`. App files sync to root of same bucket.

- [ ] **BigQuery Tables**:
    - Copy base tables from staging to prod dataset using `bq cp`.

## 4. Third-Party Services & Final Configuration
*Update external keys and environment-specific settings AFTER data migration.*

- [ ] **Resend (Email)**:
    - [ ] Create production API Key.
    - [ ] Add and verify production domain via DNS (SPF, DKIM).
    - [ ] Update webhook URLs to point to production Cloud Functions.
- [ ] **App Configuration Update**: 
    - [ ] Update `cfg_app_config/main` -> `notificationSettings.emailApiKey` with Production Resend Key.
    - [ ] Update `cfg_app_config/main` -> `notificationSettings.frontendDomain` to `apitherapy.beelive.biz`.
- [ ] **Error Monitoring**: Initialize production project in Sentry (or equivalent).

## 5. Launch & Monitoring
*Manual deployment and post-deployment checks.*

- [ ] **Extension Service Account**: Grant `BigQuery Data Editor` role to the extension service account on the prod project (Required for BQ Sync).
- [ ] **Initial Extensions Deploy**: Run `firebase deploy --only extensions --project prod`.
- [ ] **Full Production Deploy**: Run `.\deploy-prod.ps1`.
- [ ] **Smoke Test**: Verify login and core clinical workflows on the live domain.
- [ ] **App Check Enforcement**: Switch App Check to 'Enforce' mode.
- [ ] **Daily Backups**: Configure Cloud Scheduler for automated Firestore daily exports.
- [ ] **Error Alerts**: Set up Log-based metrics for Cloud Function errors.

## 6. CI/CD Automation (Post-Launch)
*Automate the delivery pipeline for long-term maintenance.*

- [ ] **GitHub Secrets**: Add `FIREBASE_TOKEN_PROD`, `VITE_` vars, and `RESEND_API_KEY_PROD` to GitHub Actions.
- [ ] **Workflow File**: Create `.github/workflows/deploy-prod.yml` (Trigger: push to main).
- [ ] **Branch Protection**: Require PR reviews and passing CI checks for the `main` branch.
