# deploy-staging.ps1
$ErrorActionPreference = "Stop"

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

Write-Host "--- STARTING STAGING DEPLOYMENT ---" -ForegroundColor Cyan

# 1. SYNC BIGQUERY VIEWS (STAGING)
Invoke-Step -Name "Sync BigQuery views" `
    -Action { node scripts/deploy/sync-bq-views.js --deploy --dev_stage } `
    -RecommendedAction "Re-run: node scripts/deploy/sync-bq-views.js --deploy --dev_stage"

# 2. CLEAR CACHE & OLD BUILDS (best-effort, never blocks)
Write-Host "`n-> Clearing old builds and cache..." -ForegroundColor Yellow
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .firebase -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force functions/lib -ErrorAction SilentlyContinue

# 3. BUILD FRONTEND
$frontendBuildOk = Invoke-Step -Name "Build frontend" `
    -Action { npx vite build --mode staging } `
    -RecommendedAction "Re-run: npx vite build --mode staging, fix errors, then re-run this deploy script."

# 4. BUILD FUNCTIONS
$functionsBuildOk = Invoke-Step -Name "Build Cloud Functions" `
    -Action { Push-Location functions; npm run build; Pop-Location } `
    -RecommendedAction "Re-run: cd functions; npm run build"

# 5. RULES REGRESSION TEST (blocking gate for the two rule-deploy steps below)
$rulesTestOk = Invoke-Step -Name "Rules regression test (local emulator)" `
    -Action { & .\scripts\deploy\rules-test-check.ps1 } `
    -RecommendedAction "Re-run: .\scripts\deploy\rules-test-check.ps1, fix the failing rule/test, then re-run this deploy script."

# 6. DEPLOY FIRESTORE & STORAGE (gated on the rules regression test passing)
if ($rulesTestOk) {
    Invoke-Step -Name "Deploy Firestore rules/indexes" `
        -Action { firebase deploy --only firestore --project apitherapyv2 } `
        -RecommendedAction "Re-run: firebase deploy --only firestore --project apitherapyv2"

    Invoke-Step -Name "Deploy Storage rules" `
        -Action { firebase deploy --only storage --project apitherapyv2 } `
        -RecommendedAction "Re-run: firebase deploy --only storage --project apitherapyv2"
}
else {
    Add-SkippedStep -Name "Deploy Firestore rules/indexes" -Reason "Rules regression test failed" `
        -RecommendedAction "Fix the failing rule/test, then run: firebase deploy --only firestore --project apitherapyv2"
    Add-SkippedStep -Name "Deploy Storage rules" -Reason "Rules regression test failed" `
        -RecommendedAction "Fix the failing rule/test, then run: firebase deploy --only storage --project apitherapyv2"
}

# 7. APPLY CORS
Invoke-Step -Name "Apply CORS to Staging Storage Bucket" `
    -Action { gcloud storage buckets update gs://apitherapyv2-staging-storage --cors-file=cors-staging.json } `
    -RecommendedAction "Re-run: gcloud storage buckets update gs://apitherapyv2-staging-storage --cors-file=cors-staging.json"

# 8. DEPLOY FUNCTIONS (depends on functions build)
if ($functionsBuildOk) {
    Invoke-Step -Name "Deploy Cloud Functions" `
        -Action { firebase deploy --only functions --project apitherapyv2 } `
        -RecommendedAction "Re-run: firebase deploy --only functions --project apitherapyv2"
}
else {
    Add-SkippedStep -Name "Deploy Cloud Functions" -Reason "Functions build failed" `
        -RecommendedAction "Fix the build errors, then run: firebase deploy --only functions --project apitherapyv2"
}

# 9. DEPLOY HOSTING (depends on frontend build)
if ($frontendBuildOk) {
    Invoke-Step -Name "Deploy Hosting" `
        -Action { firebase deploy --only hosting --project apitherapyv2 } `
        -RecommendedAction "Re-run: firebase deploy --only hosting --project apitherapyv2"
}
else {
    Add-SkippedStep -Name "Deploy Hosting" -Reason "Frontend build failed" `
        -RecommendedAction "Fix the build errors, then run: firebase deploy --only hosting --project apitherapyv2"
}

# ==================== SUMMARY ====================
Write-Host "`n`n=== STAGING DEPLOYMENT SUMMARY ===" -ForegroundColor Cyan
$results | Format-Table Step, Status, Detail -AutoSize | Out-String | Write-Host

$failed = $results | Where-Object { $_.Status -ne "Success" }
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
