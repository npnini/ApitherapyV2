<#
.SYNOPSIS
    ONE-TIME SETUP: Grants the Production Firestore service account
    read access to the Production backup bucket.
    Run this ONCE before executing migrate-stage-to-prod.ps1.
#>

# Load Production config from .env.production
$EnvProd = Get-Content "$PSScriptRoot/../.env.production" | Where-Object { $_ -match '=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2; [PSCustomObject]@{ Key = $k.Trim(); Value = $v.Trim() }
}

$PROD_PROJECT  = ($EnvProd | Where-Object Key -eq 'VITE_PROJECT_ID').Value
$PROD_NUMBER   = ($EnvProd | Where-Object Key -eq 'VITE_MESSAGING_SENDER_ID').Value
$PROD_BUCKET   = "gs://$($($EnvProd | Where-Object Key -eq 'VITE_STORAGE_BUCKET').Value)"
$PROD_SA       = "service-$PROD_NUMBER@gcp-sa-firestore.iam.gserviceaccount.com"

# Load Staging config for migration bucket permissions
$EnvStaging = Get-Content "$PSScriptRoot/../.env.staging" | Where-Object { $_ -match '=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2; [PSCustomObject]@{ Key = $k.Trim(); Value = $v.Trim() }
}
$STAGING_PROJECT = ($EnvStaging | Where-Object Key -eq 'VITE_PROJECT_ID').Value
$STAGING_NUMBER  = ($EnvStaging | Where-Object Key -eq 'VITE_MESSAGING_SENDER_ID').Value
$STAGING_SA      = "service-$STAGING_NUMBER@gcp-sa-firestore.iam.gserviceaccount.com"
$STAGING_TEMP_BUCKET = "gs://apitherapyv2-israel-temp"

Write-Host "Granting Firestore access to migration buckets..." -ForegroundColor Cyan
Write-Host "  [PROD] Bucket : $PROD_BUCKET"
Write-Host "  [PROD] SA     : $PROD_SA"
Write-Host "  [STAGE] Bucket: $STAGING_TEMP_BUCKET"
Write-Host "  [STAGE] SA    : $STAGING_SA"
Write-Host ""

# Prod Permissions
gcloud storage buckets add-iam-policy-binding $PROD_BUCKET `
    --member="serviceAccount:$PROD_SA" `
    --role="roles/storage.objectViewer" `
    --project=$PROD_PROJECT

# Staging Permissions (Admin needed to create/delete exports)
gcloud storage buckets add-iam-policy-binding $STAGING_TEMP_BUCKET `
    --member="serviceAccount:$STAGING_SA" `
    --role="roles/storage.objectAdmin" `
    --project=$STAGING_PROJECT

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Permissions granted successfully." -ForegroundColor Green
} else {
    Write-Error "Permission grant failed. Check that you are authenticated with: gcloud auth login"
}

