# SYNOPSIS
#     Air-gapped migration from Staging to Production.
#     Uses local machine as a bridge to ensure zero cross-environment cloud connectivity.
#
# NOTES
#     Prerequisites (run ONCE before first use):
#     1. gcloud auth login
#     2. .\scripts\setup-migration-permissions.ps1

# ---------------------------------------------------------------------------
# Load config from .env files (single source of truth)
# ---------------------------------------------------------------------------
$EnvProd = Get-Content "$PSScriptRoot/../.env.production" | Where-Object { $_ -match '=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2; [PSCustomObject]@{ Key = $k.Trim(); Value = $v.Trim() }
}
$EnvStaging = Get-Content "$PSScriptRoot/../.env.staging" | Where-Object { $_ -match '=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2; [PSCustomObject]@{ Key = $k.Trim(); Value = $v.Trim() }
}

$STAGING_PROJECT  = ($EnvStaging | Where-Object Key -eq 'VITE_PROJECT_ID').Value
$PROD_PROJECT     = ($EnvProd    | Where-Object Key -eq 'VITE_PROJECT_ID').Value
$STAGING_BUCKET   = "gs://$($($EnvStaging | Where-Object Key -eq 'VITE_STORAGE_BUCKET').Value)"
$PROD_BUCKET      = "gs://$($($EnvProd    | Where-Object Key -eq 'VITE_STORAGE_BUCKET').Value)"

# Handle region mismatch: Staging Firestore is me-west1, but default bucket is us-central1.
# We must export to a bucket in me-west1.
$STAGING_EXPORT_BUCKET = "gs://apitherapyv2-israel-temp"
$PROD_BACKUPS          = "$PROD_BUCKET/backups"  # Subfolder inside prod bucket for Firestore imports

$TEMP_DIR    = "$PSScriptRoot/../temp_migration"
$TIMESTAMP   = Get-Date -Format "yyyyMMdd_HHmmss"
$EXPORT_PATH = "migration_$TIMESTAMP"

Write-Host ""
Write-Host "=== Air-Gapped Migration: Staging -> Local -> Production ===" -ForegroundColor Cyan
Write-Host "  Staging bucket : $STAGING_BUCKET"
Write-Host "  Prod bucket    : $PROD_BUCKET"
Write-Host "  Export path    : $EXPORT_PATH"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Cleanup & Preparation
# ---------------------------------------------------------------------------
if (Test-Path $TEMP_DIR) {
    Write-Host "Cleaning up previous temp directory..." -ForegroundColor Gray
    Remove-Item -Recurse -Force $TEMP_DIR
}
New-Item -ItemType Directory -Path "$TEMP_DIR/firestore" | Out-Null
New-Item -ItemType Directory -Path "$TEMP_DIR/storage"   | Out-Null

# ---------------------------------------------------------------------------
# 2. FIRESTORE EXPORT (runs inside Staging — no prod contact)
# ---------------------------------------------------------------------------
Write-Host "[1/6] Exporting Firestore from Staging to Staging bucket ($STAGING_EXPORT_BUCKET)..." -ForegroundColor Yellow
gcloud firestore export "$STAGING_EXPORT_BUCKET/exports/$EXPORT_PATH" --project=$STAGING_PROJECT
if ($LASTEXITCODE -ne 0) { Write-Error "Firestore export failed. Aborting."; exit 1 }

# ---------------------------------------------------------------------------
# 3. DOWNLOAD TO LOCAL (your machine bridges the gap)
# ---------------------------------------------------------------------------
Write-Host "[2/6] Downloading Firestore export to local machine..." -ForegroundColor Yellow
gcloud storage cp -r "$STAGING_EXPORT_BUCKET/exports/$EXPORT_PATH" "$TEMP_DIR/firestore/"
if ($LASTEXITCODE -ne 0) { Write-Error "Firestore download failed. Aborting."; exit 1 }

Write-Host "[3/6] Downloading Storage files to local machine (excluding extension artifacts & old backups)..." -ForegroundColor Yellow
gcloud storage rsync -r "$STAGING_BUCKET" "$TEMP_DIR/storage" --exclude="(exports|firebase-export-.*|migration_backup)\/.*"
if ($LASTEXITCODE -ne 0) { Write-Error "Storage download failed. Aborting."; exit 1 }

# ---------------------------------------------------------------------------
# 4. UPLOAD TO PRODUCTION (your machine bridges the gap)
# ---------------------------------------------------------------------------
Write-Host "[4/6] Uploading Firestore export to Production backup bucket..." -ForegroundColor Yellow
gcloud storage cp -r "$TEMP_DIR/firestore/$EXPORT_PATH" "$PROD_BACKUPS/"
if ($LASTEXITCODE -ne 0) { Write-Error "Firestore upload failed. Aborting."; exit 1 }

Write-Host "[5/6] Syncing Storage files to Production Storage..." -ForegroundColor Yellow
gcloud storage rsync -r "$TEMP_DIR/storage" "$PROD_BUCKET" --exclude="backups/.*"
if ($LASTEXITCODE -ne 0) { Write-Error "Storage sync failed. Aborting."; exit 1 }

# ---------------------------------------------------------------------------
# 5. FIRESTORE IMPORT (runs inside Production — no staging contact)
# ---------------------------------------------------------------------------
Write-Host "[6/6] Importing Firestore data into Production database..." -ForegroundColor Yellow
gcloud firestore import "$PROD_BACKUPS/$EXPORT_PATH" --project=$PROD_PROJECT
if ($LASTEXITCODE -ne 0) { Write-Error "Firestore import failed. Aborting."; exit 1 }

# ---------------------------------------------------------------------------
# 6. METADATA OPTIMIZATION (Fixes Hebrew rendering)
# ---------------------------------------------------------------------------
Write-Host "Optimizing metadata for Hebrew rendering (UTF-8)..." -ForegroundColor Cyan
gcloud storage objects update "$PROD_BUCKET/**/*.txt" --content-type="text/plain; charset=utf-8"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=== Migration Complete ===" -ForegroundColor Green
Write-Host "Next Steps:" -ForegroundColor White
Write-Host "  1. Update cfg_app_config/main in Production Firestore:"
Write-Host "       frontendDomain  -> https://apitherapy.beelive.biz"
Write-Host "       emailApiKey     -> [Production Resend Key]"
Write-Host "  2. Run .\deploy-prod.ps1 to sync functions and extensions."
Write-Host ""
