# rules-test-check.ps1
#
# Regression gate for Firestore/Storage security rules: runs tests/security-rules/
# against the local Firebase emulator via @firebase/rules-unit-testing. Runs
# unconditionally on every invocation (no trigger-gating like sast-check.ps1's
# day/vuln-delta/change-volume conditions) - this is fast (local emulator only,
# no cloud calls) and directly correctness-critical for the app's access-control
# boundary, so there's no reason to skip it.
#
# Called from scripts/deploy/deploy-staging.ps1 (before the Firestore/Storage
# rule-deploy steps) and scripts/deploy/finish-feature.ps1 (before the final
# deploy-prod.ps1 stage) - never wired into deploy-prod.ps1 directly; production
# is only protected transitively via finish-feature.ps1's gate.
#
# Exit 0 = all rules regression tests passed.
# Exit 1 = a test failed, or the emulator/test run itself errored.

$ErrorActionPreference = "Stop"

Write-Host "--- RULES REGRESSION TEST (Firestore + Storage, local emulator) ---" -ForegroundColor Cyan

$global:LASTEXITCODE = 0
try {
    firebase emulators:exec --only firestore,storage,auth "node --test tests/security-rules/*.test.js"
    if ($LASTEXITCODE -ne 0) {
        throw "Rules regression tests failed (exit code $LASTEXITCODE)"
    }
    Write-Host "`n=== RULES REGRESSION TEST: PASSED ===" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "`n[FAILED] Rules regression test: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Review the failing assertion(s) above. If a rules change is intentional, update the" -ForegroundColor Yellow
    Write-Host "corresponding test in tests/security-rules/ to match the new intended behavior." -ForegroundColor Yellow
    Write-Host "`n=== RULES REGRESSION TEST: FAILED ===" -ForegroundColor Red
    exit 1
}
