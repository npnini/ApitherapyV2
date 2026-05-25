# deploy-staging.ps1
# Exit immediately if a command fails
$ErrorActionPreference = "Stop"

# 1. SYNC BIGQUERY VIEWS (STAGING)
Write-Host "Syncing BigQuery views to Staging..." -ForegroundColor Cyan
node scripts/sync-bq-views.js --deploy --dev_stage

# 2. DELETE THE CACHE & OLD BUILDS
Write-Host "Clearing old builds and cache..." -ForegroundColor Cyan
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .firebase -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force functions/lib -ErrorAction SilentlyContinue

# 2. BUILD FRONTEND
Write-Host "Building the frontend application..." -ForegroundColor Cyan
npx vite build --mode staging

# 3. BUILD FUNCTIONS
Write-Host "Building Cloud Functions..." -ForegroundColor Cyan
Push-Location functions
npm run build
Pop-Location

# 4. DEPLOY
Write-Host "Deploying to Firebase (Hosting, Functions, Storage, Firestore)..." -ForegroundColor Cyan
# Using --project to ensure it targets the correct Firebase project
firebase deploy --only "hosting,functions,storage,firestore" --project apitherapyv2

# 5. APPLY CORS
Write-Host "Applying CORS configuration to Staging Storage Bucket..." -ForegroundColor Cyan
gcloud storage buckets update gs://apitherapyv2-staging-storage --cors-file=cors-staging.json

Write-Host "Deployment successful!" -ForegroundColor Green
