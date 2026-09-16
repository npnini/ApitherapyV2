# sast-check.ps1
#
# Actual SAST scan: ESLint with plugin:security/recommended, scoped to functions/
# (functions/.eslintrc.security.js - kept separate from the regular .eslintrc.js
# so this ruleset never affects `npm run lint`). --max-warnings 0 means any
# finding blocks, regardless of the plugin's default warn/error severities.
#
# Only meant to be invoked when scripts/deploy/sast-trigger-check.ps1 reports
# SAST is needed (exit 2) - but runs standalone fine at any time too.
#
# Always updates .security-state.json on completion (pass or fail) - the
# "last run" clock/baseline resets because a scan happened, independent of
# what it found.
#
# Exit 0 = scan completed, no findings.
# Exit 1 = scan completed WITH findings, or the scan itself failed to run.

$ErrorActionPreference = "Stop"
$StateFile = ".security-state.json"

function Get-CurrentVulnCount {
    $total = 0
    foreach ($path in @(".", "functions")) {
        Push-Location $path
        try {
            $json = (npm audit --json 2>$null) -join "`n"
            $audit = $json | ConvertFrom-Json
            $total += $audit.metadata.vulnerabilities.total
        }
        catch {
            Write-Host "  [!] Could not read npm audit in '$path' - treating as 0 for this run." -ForegroundColor Yellow
        }
        finally {
            Pop-Location
        }
    }
    return $total
}

function Update-SecurityState {
    param([string]$Commit, [int]$VulnCount)
    $state = [PSCustomObject]@{
        lastSastRunDate          = (Get-Date).ToUniversalTime().ToString("o")
        lastSastCommit           = $Commit
        lastSastVulnerabilityCount = $VulnCount
    }
    $state | ConvertTo-Json | Set-Content -Path $StateFile -Encoding utf8
    Write-Host "`nUpdated $StateFile (commit: $($Commit.Substring(0, [Math]::Min(8, $Commit.Length))), vuln count: $VulnCount)" -ForegroundColor Cyan
}

Write-Host "--- SAST CHECK (ESLint security scan of functions/) ---" -ForegroundColor Cyan

$currentCommit = (git rev-parse HEAD 2>$null).Trim()
if (-not $currentCommit) {
    Write-Host "[!] Could not resolve current git commit - state will be recorded without a valid commit reference." -ForegroundColor Yellow
    $currentCommit = ""
}

Write-Host "`n-> Running ESLint security scan..." -ForegroundColor Yellow
Push-Location functions
$global:LASTEXITCODE = 0
try {
    # Routed through cmd /c: invoking npx.ps1 directly via PowerShell's `&` mishandles
    # arguments on this setup (silently drops/mismatches the target path), while cmd's
    # npx.cmd shim works correctly - verified directly against this project's ESLint config.
    cmd /c "npx eslint --no-eslintrc -c .eslintrc.security.js --ext .js,.ts --max-warnings 0 src"
    $scanExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

$currentVulnCount = Get-CurrentVulnCount
Update-SecurityState -Commit $currentCommit -VulnCount $currentVulnCount

Write-Host ""
if ($scanExitCode -eq 0) {
    Write-Host "=== SAST CHECK: CLEAN - no findings ===" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "=== SAST CHECK: FINDINGS REPORTED ABOVE - review and fix before deploying ===" -ForegroundColor Red
    Write-Host "Recommended: address each finding (or add a targeted eslint-disable with justification for confirmed false positives), then re-run this script." -ForegroundColor Yellow
    exit 1
}
