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
$SA            = "service-$PROD_NUMBER@gcp-sa-firestore.iam.gserviceaccount.com"

Write-Host "Granting Firestore import access to Production Storage bucket..." -ForegroundColor Cyan
Write-Host "  Project : $PROD_PROJECT"
Write-Host "  Bucket  : $PROD_BUCKET"
Write-Host "  SA      : $SA"
Write-Host ""

gcloud storage buckets add-iam-policy-binding $PROD_BUCKET `
    --member="serviceAccount:$SA" `
    --role="roles/storage.objectViewer" `
    --project=$PROD_PROJECT

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Permission granted successfully. You can now run migrate-stage-to-prod.ps1." -ForegroundColor Green
} else {
    Write-Error "Permission grant failed. Check that you are authenticated with: gcloud auth login"
}
