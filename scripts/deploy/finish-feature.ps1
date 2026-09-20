# Usage: .\finish-feature.ps1 -Message "feat: your descriptive commit message"
#
# Fully automated pipeline (see docs / the security-check design discussion for
# the full rationale):
#
#   1. security-check.ps1     (secrets + npm audit, BLOCKING)   - before any git action
#   2. git add / commit / push feature branch / checkout main / pull / merge / push main
#   3. rules-test-check.ps1   (Firestore/Storage rules regression tests, BLOCKING)
#   4. sast-trigger-check.ps1 (reads .security-state.json, decides if SAST is due)
#   5. sast-check.ps1         (only if step 4 says needed - synchronous, waited on)
#   6. deploy-prod.ps1        (runs automatically once every applicable check is clean)
#
# rules-test-check.ps1 runs unconditionally here (not just in deploy-staging.ps1) as
# defense in depth: it covers the case where deploy-staging.ps1 was bypassed entirely,
# so this is the last gate before deploy-prod.ps1 would otherwise ship an unverified
# rules change straight to production. deploy-prod.ps1 itself is never gated directly -
# production is only protected transitively via this stage.
#
# There is no separate "yes, ship it" confirmation at the end - staging verification
# (done before this script is ever run) plus the security/SAST gates ARE the checkpoint.
# A blocking finding at any stage halts the pipeline before the next stage runs.

param (
    [Parameter(Mandatory = $true)]
    [string]$Message
)

$ErrorActionPreference = "Stop"

try {
    # 1. Get current branch name
    $currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($currentBranch -eq "main" -or $currentBranch -eq "master") {
        Write-Host "Error: You are already on main/master. Please run this from a feature branch." -ForegroundColor Red
        return
    }

    Write-Host ("Finishing feature on branch: " + $currentBranch)

    # ==================== STAGE 1: SECURITY CHECK (blocking, pre-git) ====================
    Write-Host "`n=== STAGE 1/6: Security check (secrets + dependency audit) ===" -ForegroundColor Cyan
    & .\scripts\deploy\security-check.ps1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nHALTED: security-check.ps1 found a blocking issue (see above)." -ForegroundColor Red
        Write-Host "No git action was taken - nothing was committed or pushed. Fix the issue(s) above and re-run." -ForegroundColor Yellow
        return
    }

    # ==================== STAGE 2: COMMIT, PUSH, MERGE TO MAIN ====================
    Write-Host "`n=== STAGE 2/6: Commit, push, merge to main ===" -ForegroundColor Cyan

    Write-Host "1. Staging and committing changes..."
    git add .
    if ($LASTEXITCODE -ne 0) { throw "git add failed" }

    git commit -m "$Message" --allow-empty
    if ($LASTEXITCODE -ne 0) { throw "git commit failed" }

    Write-Host ("2. Pushing " + $currentBranch + " to origin...")
    git push origin $currentBranch
    if ($LASTEXITCODE -ne 0) { throw "git push feature branch failed" }

    Write-Host "3. Switching to main and pulling latest..."
    git checkout main
    if ($LASTEXITCODE -ne 0) { throw "git checkout main failed" }

    $targetBranch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($targetBranch -ne "main") {
        throw ("Failed to switch to main branch. Currently on: " + $targetBranch)
    }

    git pull origin main
    if ($LASTEXITCODE -ne 0) { throw "git pull main failed" }

    Write-Host ("4. Merging " + $currentBranch + " into main...")
    git merge $currentBranch
    if ($LASTEXITCODE -ne 0) { throw "git merge failed" }

    Write-Host "5. Pushing main to origin..."
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push main failed" }

    Write-Host ("6. Deleting local feature branch " + $currentBranch + "...")
    git branch -d $currentBranch

    Write-Host "`nFeature successfully merged and pushed to main!" -ForegroundColor Green

    # ==================== STAGE 3: RULES REGRESSION TEST (blocking) ====================
    Write-Host "`n=== STAGE 3/6: Rules regression test (Firestore + Storage, local emulator) ===" -ForegroundColor Cyan
    & .\scripts\deploy\rules-test-check.ps1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nHALTED: rules-test-check.ps1 found a blocking issue (see above)." -ForegroundColor Red
        Write-Host "main was already updated with this merge, but production was NOT deployed." -ForegroundColor Yellow
        Write-Host "Review the failing assertion(s), fix the rule or the test, then run: .\scripts\deploy\rules-test-check.ps1" -ForegroundColor Yellow
        Write-Host "Once it passes, run: .\scripts\deploy\deploy-prod.ps1" -ForegroundColor Yellow
        return
    }

    # ==================== STAGE 4: SAST TRIGGER CHECK ====================
    Write-Host "`n=== STAGE 4/6: SAST trigger check ===" -ForegroundColor Cyan
    & .\scripts\deploy\sast-trigger-check.ps1
    $sastTriggerExit = $LASTEXITCODE

    $sastClean = $true
    if ($sastTriggerExit -eq 0) {
        Write-Host "`nSAST not needed right now - skipping to production deploy." -ForegroundColor Green
    }
    else {
        # exit 2 (needed) or exit 1 (trigger-check itself errored - fail safe, treat as needed)
        Write-Host "`n=== STAGE 5/6: SAST check (triggered) ===" -ForegroundColor Cyan
        & .\scripts\deploy\sast-check.ps1
        $sastCheckExit = $LASTEXITCODE
        if ($sastCheckExit -ne 0) {
            $sastClean = $false
        }
    }

    if (-not $sastClean) {
        Write-Host "`nHALTED: sast-check.ps1 reported findings (see above)." -ForegroundColor Red
        Write-Host "main was already updated with this merge, but production was NOT deployed." -ForegroundColor Yellow
        Write-Host "Review the findings, fix or justify them, then run: .\scripts\deploy\sast-check.ps1" -ForegroundColor Yellow
        Write-Host "Once it reports clean, run: .\scripts\deploy\deploy-prod.ps1" -ForegroundColor Yellow
        return
    }

    # ==================== STAGE 6: DEPLOY TO PRODUCTION ====================
    Write-Host "`n=== STAGE 6/6: Deploy to production ===" -ForegroundColor Cyan
    & .\scripts\deploy\deploy-prod.ps1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`ndeploy-prod.ps1 reported issues - see its summary above." -ForegroundColor Red
        Write-Host "main was already updated with this merge; re-run: .\scripts\deploy\deploy-prod.ps1  once resolved." -ForegroundColor Yellow
        return
    }

    Write-Host "`nPipeline complete: merged to main and deployed to production." -ForegroundColor Green
    Write-Host "You are now on branch: main"
}
catch {
    Write-Host "An error occurred:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Status summary:" -ForegroundColor Yellow
    git status -s
    Write-Host ("Current Branch: " + (git rev-parse --abbrev-ref HEAD))
}
