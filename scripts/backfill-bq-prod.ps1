# backfill-bq-prod.ps1
# Backfills all Firestore collections into BigQuery for the Production project.

$PROJECT_ID = "apitherapy-c94a6"
$DATASET_ID = "apitherapy_clinical_analytics_prod"
$LOCATION = "me-west1"

$COLLECTIONS = @(
    "cfg_acupuncture_points",
    "cfg_measures",
    "cfg_problems",
    "cfg_protocols",
    "measured_values",
    "patient_medical_data",
    "patients",
    "treatments"
)

Write-Host "--- STARTING BIGQUERY BACKFILL (PRODUCTION) ---" -ForegroundColor Cyan
Write-Host "Project : $PROJECT_ID"
Write-Host "Dataset : $DATASET_ID"
Write-Host "Location: $LOCATION"
Write-Host ""

foreach ($col in $COLLECTIONS) {
    Write-Host "[*] Backfilling collection: $col ..." -ForegroundColor Yellow
    
    # Run the official import script
    npx @firebaseextensions/fs-bq-import-collection `
        --project $PROJECT_ID `
        --source-collection-path $col `
        --dataset $DATASET_ID `
        --table-name-prefix $col `
        --dataset-location $LOCATION `
        --query-collection-group false `
        --non-interactive
        
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   [!] Failed to backfill $col. Error Code: $LASTEXITCODE" -ForegroundColor Red
    } else {
        Write-Host "   [+] $col backfill initiated/completed." -ForegroundColor Green
    }
}

Write-Host "`n--- BACKFILL PROCESS COMPLETED ---" -ForegroundColor Green
