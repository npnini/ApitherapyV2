# security-check.ps1
#
# Blocking security gate: secret scanning (gitleaks) + dependency vulnerability
# audit (npm audit, root and functions/). Runs standalone at any time, or as the
# first step of finish-feature.ps1, BEFORE any git action, so a leaked secret
# never reaches a push.
#
# Exit 0 = clean, safe to proceed.
# Exit 1 = a blocking issue was found (secret, or high/critical vulnerability) — do not commit/push/deploy.

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

function Add-Result {
    param([string]$Name, [string]$Status, [string]$Detail, [string]$Action = "")
    $script:results += [PSCustomObject]@{ Step = $Name; Status = $Status; Detail = $Detail; Action = $Action }
}

function Get-AuditSummary {
    param([string]$Path)
    Push-Location $Path
    try {
        $json = (npm audit --json 2>$null) -join "`n"
        return $json | ConvertFrom-Json
    }
    finally {
        Pop-Location
    }
}

Write-Host "--- SECURITY CHECK (secrets + dependency audit) ---" -ForegroundColor Cyan

# ==================== 1. SECRET SCAN - gitleaks ====================
$gitleaksCmd = Get-Command gitleaks -ErrorAction SilentlyContinue
if (-not $gitleaksCmd) {
    Write-Host "`n-> Secret scan (gitleaks)... NOT INSTALLED" -ForegroundColor Red
    Add-Result -Name "Secret scan (gitleaks)" -Status "FAILED" `
        -Detail "gitleaks not found on PATH" `
        -Action "Install gitleaks in an Administrator shell: choco install gitleaks -y  -- then re-run this script."
}
else {
    # Stage current changes first (benign/reversible - just `git add .`) so the scan
    # target is exactly "what's about to be committed", respecting .gitignore. This is
    # why `protect --staged` is used instead of a raw filesystem scan: a filesystem scan
    # would permanently flag gitignored local files (.env.local, service-account.json,
    # etc.) that were never going to be pushed, making the check impossible to ever pass.
    $prevEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    git add . 2>$null | Out-Null
    $ErrorActionPreference = $prevEAP

    $gitleaksArgs = @("protect", "--source", ".", "--staged", "-v", "--redact")
    if (Test-Path ".gitleaks.toml") { $gitleaksArgs += @("--config", ".gitleaks.toml") }
    Invoke-Step -Name "Secret scan (gitleaks)" `
        -Action { & gitleaks @gitleaksArgs } `
        -RecommendedAction "Review the file/line reported above, remove the secret, and rotate the credential if it may already have been committed. Re-run this script after fixing." `
        | Out-Null
}

# ==================== 2. DEPENDENCY AUDIT - npm audit ====================
#
# Known, investigated, accepted exceptions - excluded from the blocking high/critical
# count below, but still surfaced in the output (never silently hidden). Each entry
# documents WHY it doesn't apply to this project's actual runtime, so the exception is
# a conscious, re-checkable decision rather than a blind spot. Re-verify if the
# dependency chain, build tooling, or how this repo uses these packages ever changes.
$script:AcceptedVulnerabilityExceptions = @{
    "undici"  = "Transitive dependency of the Firebase client SDK's Node.js-only auth code path. Verified 2026-09-16: does not appear in the built browser bundle (dist/assets/*.js) - Vite resolves Firebase's 'browser' package.json export condition instead, and no Node.js script in this repo imports the client 'firebase' package (all use firebase-admin, a separate SDK)."
    "esbuild" = "Dev-server-only risk: a malicious website could read local Vite dev server responses via CORS while `npm run dev` is active. Does not affect production builds (dist/) - esbuild's dev server is not part of the shipped output. Fix requires --force (breaking upgrade to vite@8.x). Avoid browsing untrusted sites while the local dev server is running."
    "vite"    = "Same root cause as esbuild above (vite's dev server depends on the vulnerable esbuild version)."
}

function Test-AuditPath {
    param([string]$Label, [string]$Path)
    try {
        $audit = Get-AuditSummary -Path $Path
        $vulns = $audit.metadata.vulnerabilities

        $blockingEntries = @()
        $exceptedEntries = @()
        foreach ($prop in $audit.vulnerabilities.PSObject.Properties) {
            $pkgName = $prop.Name
            $pkgSeverity = $prop.Value.severity
            if ($pkgSeverity -eq "high" -or $pkgSeverity -eq "critical") {
                if ($script:AcceptedVulnerabilityExceptions.ContainsKey($pkgName)) {
                    $exceptedEntries += "$pkgName ($pkgSeverity)"
                }
                else {
                    $blockingEntries += "$pkgName ($pkgSeverity)"
                }
            }
        }

        if ($exceptedEntries.Count -gt 0) {
            Write-Host "   Accepted exceptions ($Label): $($exceptedEntries -join ', ')" -ForegroundColor DarkYellow
            foreach ($name in ($exceptedEntries | ForEach-Object { $_.Split(' ')[0] } | Select-Object -Unique)) {
                Write-Host "     - $name : $($script:AcceptedVulnerabilityExceptions[$name])" -ForegroundColor DarkYellow
            }
        }

        if ($blockingEntries.Count -gt 0) {
            Write-Host "`n-> Dependency audit ($Label)... FAILED ($($blockingEntries.Count) unaccepted high/critical)" -ForegroundColor Red
            Add-Result -Name "Dependency audit ($Label)" -Status "FAILED" `
                -Detail "$($blockingEntries -join ', ')" `
                -Action "Run: (cd $Path &&) npm audit  -- review, then npm audit fix, update the package(s), or add a documented exception in this script if genuinely not applicable."
        }
        else {
            $note = if ($exceptedEntries.Count -gt 0) { ", $($exceptedEntries.Count) accepted exception(s)" } else { "" }
            Write-Host "`n-> Dependency audit ($Label)... OK ($($vulns.total) total, none blocking$note)" -ForegroundColor Green
            Add-Result -Name "Dependency audit ($Label)" -Status "Success" `
                -Detail "$($vulns.total) total ($($vulns.moderate) moderate, $($vulns.low) low)$note"
        }
        return $vulns.total
    }
    catch {
        Write-Host "`n-> Dependency audit ($Label)... FAILED (could not run/parse npm audit)" -ForegroundColor Red
        Add-Result -Name "Dependency audit ($Label)" -Status "FAILED" `
            -Detail $_.Exception.Message `
            -Action "Run: (cd $Path &&) npm audit  manually and investigate the error."
        return 0
    }
}

$rootVulnTotal = Test-AuditPath -Label "root" -Path "."
$functionsVulnTotal = Test-AuditPath -Label "functions" -Path "functions"
$totalVulnCount = $rootVulnTotal + $functionsVulnTotal

# ==================== SUMMARY ====================
Write-Host "`n`n=== SECURITY CHECK SUMMARY ===" -ForegroundColor Cyan
$results | Format-Table Step, Status, Detail -AutoSize | Out-String | Write-Host
Write-Host "Total dependency vulnerabilities (root + functions): $totalVulnCount" -ForegroundColor Cyan

$failed = $results | Where-Object { $_.Status -ne "Success" }
if ($failed.Count -gt 0) {
    Write-Host "`n$($failed.Count) issue(s) must be resolved before continuing:" -ForegroundColor Red
    foreach ($f in $failed) {
        Write-Host "- $($f.Step): $($f.Detail)" -ForegroundColor Red
        Write-Host "  Recommended: $($f.Action)" -ForegroundColor Yellow
    }
    exit 1
}
else {
    Write-Host "`nAll security checks passed." -ForegroundColor Green
    exit 0
}
