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
} else {
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

# 6. DEPLOY SERVICES
$deployTargets = "hosting,functions,storage,firestore"
if ($NEEDS_EXT_DEPLOY) {
    $deployTargets += ",extensions"
    Write-Host "[6/6] Deploying Core Services + Extensions to PRODUCTION (This may take 10+ mins)..." -ForegroundColor Cyan
} else {
    Write-Host "[6/6] Deploying Core Services to PRODUCTION..." -ForegroundColor Cyan
}

firebase deploy --only $deployTargets --project prod

# 7. UPDATE DEPLOYMENT RECORD
if ($?) {
    Get-Date | Out-File $LAST_DEPLOY_FILE
    Write-Host "`nDeployment to PRODUCTION Successful!" -ForegroundColor Green
}
