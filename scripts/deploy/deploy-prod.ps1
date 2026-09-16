# deploy-prod.ps1
$ErrorActionPreference = "Stop"

$LAST_DEPLOY_FILE = ".last_prod_deploy"
$NEEDS_EXT_DEPLOY = $false
$results = @()

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [string]$RecommendedAction = "Re-run this step manually and check the error output above."
    )
    Write-Host "`n-> $Name..." -ForegroundColor Yellow
    $global:LASTEXITCODE = 0
    try {
        & $Action
        if ($LASTEXITCODE -ne 0) {
            throw "Command exited with code $LASTEXITCODE"
        }
        $script:results += [PSCustomObject]@{ Step = $Name; Status = "Success"; Detail = ""; Action = "" }
        return $true
    }
    catch {
        Write-Host "[FAILED] $Name : $($_.Exception.Message)" -ForegroundColor Red
        $script:results += [PSCustomObject]@{ Step = $Name; Status = "FAILED"; Detail = $_.Exception.Message; Action = $RecommendedAction }
        return $false
    }
}

function Add-SkippedStep {
    param([string]$Name, [string]$Reason, [string]$RecommendedAction)
    Write-Host "`n-> $Name... SKIPPED ($Reason)" -ForegroundColor Yellow
    $script:results += [PSCustomObject]@{ Step = $Name; Status = "SKIPPED"; Detail = $Reason; Action = $RecommendedAction }
}

Write-Host "--- STARTING PRODUCTION DEPLOYMENT ---" -ForegroundColor Cyan

# 1. CHECK FOR EXTENSION CHANGES
Write-Host "`n-> Checking for extension configuration changes..." -ForegroundColor Yellow
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
Invoke-Step -Name "Sync BigQuery views" `
    -Action { node scripts/deploy/sync-bq-views.js --deploy --stage_prod } `
    -RecommendedAction "Re-run: node scripts/deploy/sync-bq-views.js --deploy --stage_prod"

# 3. CLEAR CACHE & OLD BUILDS (best-effort, never blocks)
Write-Host "`n-> Clearing old builds and cache..." -ForegroundColor Yellow
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .firebase -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force functions/lib -ErrorAction SilentlyContinue

# 4. BUILD FRONTEND
$frontendBuildOk = Invoke-Step -Name "Build frontend" `
    -Action { npm run build } `
    -RecommendedAction "Re-run: npm run build, fix errors, then re-run this deploy script."

# 5. BUILD FUNCTIONS
$functionsBuildOk = Invoke-Step -Name "Build Cloud Functions" `
    -Action { Push-Location functions; npm run build; Pop-Location } `
    -RecommendedAction "Re-run: cd functions; npm run build"

# ====================================================================
# 6. DEPLOY SERVICES (independent steps run regardless of one another)
# ====================================================================

# Phase A: Database Configurations & Security Rules
Invoke-Step -Name "Deploy Firestore & Storage configurations" `
    -Action { firebase deploy --only firestore, storage --project prod } `
    -RecommendedAction "Re-run: firebase deploy --only firestore,storage --project prod"

# Phase A.5: CORS
Invoke-Step -Name "Apply CORS to Production Storage Bucket" `
    -Action { gcloud storage buckets update gs://apitherapy-c94a6.firebasestorage.app --cors-file=cors-production.json } `
    -RecommendedAction "Re-run: gcloud storage buckets update gs://apitherapy-c94a6.firebasestorage.app --cors-file=cors-production.json"

# Phase B: Extensions (only if changes were detected)
if ($NEEDS_EXT_DEPLOY) {
    Invoke-Step -Name "Deploy Firebase Extensions" `
        -Action { firebase deploy --only extensions --project prod } `
        -RecommendedAction "Re-run: firebase deploy --only extensions --project prod"
}
else {
    Add-SkippedStep -Name "Deploy Firebase Extensions" -Reason "No extension config changes detected" -RecommendedAction ""
}

# Phase C: Cloud Functions (depends on functions build)
if ($functionsBuildOk) {
    Invoke-Step -Name "Deploy Cloud Functions" `
        -Action { firebase deploy --only functions --project prod } `
        -RecommendedAction "Re-run: firebase deploy --only functions --project prod"
}
else {
    Add-SkippedStep -Name "Deploy Cloud Functions" -Reason "Functions build failed" `
        -RecommendedAction "Fix the build errors, then run: firebase deploy --only functions --project prod"
}

# Phase D: Hosting (depends on frontend build)
if ($frontendBuildOk) {
    Invoke-Step -Name "Deploy Hosting" `
        -Action { firebase deploy --only hosting --project prod } `
        -RecommendedAction "Re-run: firebase deploy --only hosting --project prod"
}
else {
    Add-SkippedStep -Name "Deploy Hosting" -Reason "Frontend build failed" `
        -RecommendedAction "Fix the build errors, then run: firebase deploy --only hosting --project prod"
}

Get-Date | Out-File $LAST_DEPLOY_FILE

# ==================== SUMMARY ====================
Write-Host "`n`n=== PRODUCTION DEPLOYMENT SUMMARY ===" -ForegroundColor Cyan
$results | Format-Table Step, Status, Detail -AutoSize | Out-String | Write-Host

$failed = $results | Where-Object { $_.Status -eq "FAILED" -or $_.Status -eq "SKIPPED" -and $_.Action -ne "" }
if ($failed.Count -gt 0) {
    Write-Host "$($failed.Count) step(s) need attention:" -ForegroundColor Red
    foreach ($f in $failed) {
        Write-Host "- $($f.Step) [$($f.Status)]: $($f.Detail)" -ForegroundColor Red
        Write-Host "  Recommended: $($f.Action)" -ForegroundColor Yellow
    }
    exit 1
}
else {
    Write-Host "All steps completed successfully." -ForegroundColor Green
}
