# deploy-prod.ps1
# Exit immediately if a command fails
$ErrorActionPreference = "Stop"

$LAST_DEPLOY_FILE = ".last_prod_deploy"
$NEEDS_EXT_DEPLOY = $false

Write-Host "--- STARTING PRODUCTION DEPLOYMENT ---" -ForegroundColor Cyan

# 1. CHECK FOR EXTENSION CHANGES
Write-Host "[1/6] Checking for extension configuration changes..." -ForegroundColor Yellow
if (Test-Path $LAST_DEPLOY_FILE) {
    $lastDeployDate = (Get-Item $LAST_DEPLOY_FILE).LastWriteTime
    $envProdFiles = Get-ChildItem "extensions/*.env.prod"
    
    foreach ($file in $envProdFiles) {
        if ($file.LastWriteTime -gt $lastDeployDate) {
            $NEEDS_EXT_DEPLOY = $true
            Write-Host "   [!] Change detected in $($file.Name). Extensions will be included." -ForegroundColor Yellow
            break
        }
    }
}
else {
    Write-Host "   [!] No deployment record found. Extensions will be included by default." -ForegroundColor Yellow
    $NEEDS_EXT_DEPLOY = $true
}

# 2. SYNC BIGQUERY VIEWS (PRODUCTION)
Write-Host "[2/6] Syncing BigQuery views to PRODUCTION..." -ForegroundColor Cyan
node scripts/sync-bq-views.js --deploy --stage_prod

# 3. DELETE THE CACHE & OLD BUILDS
Write-Host "[3/6] Clearing old builds and cache..." -ForegroundColor Cyan
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .firebase -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force functions/lib -ErrorAction SilentlyContinue

# 4. BUILD FRONTEND
Write-Host "[4/6] Building the frontend application..." -ForegroundColor Cyan
npm run build

# 5. BUILD FUNCTIONS
Write-Host "[5/6] Building Cloud Functions..." -ForegroundColor Cyan
Push-Location functions
npm run build
Pop-Location

# ====================================================================
# 6. DEPLOY SERVICES (Phased Sequence to Prevent Race Conditions)
# ====================================================================
if ($NEEDS_EXT_DEPLOY) {
    Write-Host "[6/6] Deploying Core Services + Extensions to PRODUCTION (Phased Sequence)..." -ForegroundColor Cyan
}
else {
    Write-Host "[6/6] Deploying Core Services to PRODUCTION (Phased Sequence)..." -ForegroundColor Cyan
}

try {
    # Phase A: Database Configurations & Security Rules First
    Write-Host "`n -> Phase A: Deploying Firestore & Storage configurations..." -ForegroundColor Yellow
    firebase deploy --only firestore, storage --project prod

    # Phase B: Extensions (Only deployed if changes were detected)
    if ($NEEDS_EXT_DEPLOY) {
        Write-Host "`n -> Phase B: Deploying Firebase Extensions..." -ForegroundColor Yellow
        firebase deploy --only extensions --project prod
    }

    # Phase C: Backend Infrastructure (Cloud Functions)
    Write-Host "`n -> Phase C: Deploying Cloud Functions (Container compilation)..." -ForegroundColor Yellow
    firebase deploy --only functions --project prod

    # Phase D: Frontend Interface (Hosting)
    # This runs LAST. It will only push live if your backend passes all health checks!
    Write-Host "`n -> Phase D: Deploying Frontend Application to Web Hosting..." -ForegroundColor Yellow
    firebase deploy --only hosting --project prod

    # ====================================================================
    # 7. UPDATE DEPLOYMENT RECORD
    # ====================================================================
    Get-Date | Out-File $LAST_DEPLOY_FILE
    Write-Host "`n--- PRODUCTION DEPLOYMENT COMPLETED SUCCESSFULLY ---" -ForegroundColor Green

}
catch {
    Write-Host "`n[!] Deployment Pipeline Halted Due to an Error." -ForegroundColor Red
    Write-Host "If Functions failed, your live Web App (Hosting) was kept safe and untouched." -ForegroundColor Yellow
    exit 1
}