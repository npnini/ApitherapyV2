# sast-trigger-check.ps1
#
# Pure decision logic - does NOT run any scan itself. Decides whether
# scripts/deploy/sast-check.ps1 needs to run, based on three conditions read
# from .security-state.json (gitignored local state, written only by
# sast-check.ps1 after it completes):
#
#   1. Time-based:          more than $DaysThreshold days since the last SAST run.
#   2. Vulnerability-delta: current npm audit vulnerability count (root + functions)
#                            has risen by more than $VulnDeltaThreshold since the
#                            last SAST run's recorded baseline.
#   3. Change-volume:       more than $ChangedFilesThreshold files under src/ or
#                            functions/ have changed since the commit at the last
#                            SAST run.
#
# If .security-state.json doesn't exist yet (no SAST has ever run), the check
# always reports "needed".
#
# Runs standalone at any time - safe to run repeatedly, makes no changes.
#
# Exit 0 = SAST not needed right now.
# Exit 2 = SAST is needed - caller should run sast-check.ps1.
# Exit 1 = the trigger-check itself failed to run (treat as needed, fail safe).

param(
    [int]$DaysThreshold = 30,
    [int]$VulnDeltaThreshold = 5,
    [int]$ChangedFilesThreshold = 20
)

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

try {
    Write-Host "--- SAST TRIGGER CHECK ---" -ForegroundColor Cyan

    if (-not (Test-Path $StateFile)) {
        Write-Host "`nNo $StateFile found - no SAST run has ever been recorded." -ForegroundColor Yellow
        Write-Host "`n=== VERDICT: SAST NEEDED (first run) ===" -ForegroundColor Red
        exit 2
    }

    $state = Get-Content $StateFile -Raw | ConvertFrom-Json

    $reasons = @()

    # 1. Time-based
    $daysSince = $null
    if ($state.lastSastRunDate) {
        $lastRun = [datetime]::Parse($state.lastSastRunDate).ToUniversalTime()
        $daysSince = [math]::Round(((Get-Date).ToUniversalTime() - $lastRun).TotalDays, 1)
        $triggeredByTime = $daysSince -gt $DaysThreshold
        Write-Host "`n-> Time since last SAST run: $daysSince day(s) (threshold: $DaysThreshold)" -ForegroundColor Cyan
        if ($triggeredByTime) { $reasons += "$daysSince days since last run (> $DaysThreshold)" }
    }
    else {
        Write-Host "`n-> No lastSastRunDate recorded - treating as triggered." -ForegroundColor Yellow
        $reasons += "no lastSastRunDate recorded"
    }

    # 2. Vulnerability delta
    Write-Host "`n-> Checking current dependency vulnerability count..." -ForegroundColor Cyan
    $currentVulnCount = Get-CurrentVulnCount
    $lastVulnCount = if ($null -ne $state.lastSastVulnerabilityCount) { $state.lastSastVulnerabilityCount } else { 0 }
    $vulnDelta = $currentVulnCount - $lastVulnCount
    Write-Host "   Current: $currentVulnCount, at last SAST run: $lastVulnCount, delta: $vulnDelta (threshold: $VulnDeltaThreshold)" -ForegroundColor Cyan
    if ($vulnDelta -gt $VulnDeltaThreshold) { $reasons += "$vulnDelta new vulnerabilities since last run (> $VulnDeltaThreshold)" }

    # 3. Change volume
    $changedFileCount = 0
    if ($state.lastSastCommit) {
        Write-Host "`n-> Checking files changed under src/ and functions/ since $($state.lastSastCommit.Substring(0, [Math]::Min(8, $state.lastSastCommit.Length)))..." -ForegroundColor Cyan
        $commitExists = git cat-file -e "$($state.lastSastCommit)^{commit}" 2>$null; $commitOk = ($LASTEXITCODE -eq 0)
        if ($commitOk) {
            $changedFiles = git diff --name-only "$($state.lastSastCommit)" HEAD -- src functions 2>$null
            $changedFileCount = @($changedFiles | Where-Object { $_ }).Count
            Write-Host "   Changed files: $changedFileCount (threshold: $ChangedFilesThreshold)" -ForegroundColor Cyan
            if ($changedFileCount -gt $ChangedFilesThreshold) { $reasons += "$changedFileCount files changed since last run (> $ChangedFilesThreshold)" }
        }
        else {
            Write-Host "   [!] lastSastCommit not found in this repo - treating as triggered." -ForegroundColor Yellow
            $reasons += "lastSastCommit not found in repo history"
        }
    }
    else {
        Write-Host "`n-> No lastSastCommit recorded - treating as triggered." -ForegroundColor Yellow
        $reasons += "no lastSastCommit recorded"
    }

    Write-Host ""
    if ($reasons.Count -gt 0) {
        Write-Host "=== VERDICT: SAST NEEDED ===" -ForegroundColor Red
        foreach ($r in $reasons) { Write-Host "- $r" -ForegroundColor Red }
        exit 2
    }
    else {
        Write-Host "=== VERDICT: SAST NOT NEEDED ===" -ForegroundColor Green
        exit 0
    }
}
catch {
    Write-Host "`n[ERROR] sast-trigger-check.ps1 failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Failing safe - treat as SAST NEEDED." -ForegroundColor Yellow
    exit 1
}
