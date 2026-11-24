# convert-docx-to-pdf.ps1
#
# Step 3 of the English point documents: converts every .docx in a folder to a PDF with
# Microsoft Word (COM automation), one PDF per file, same base name:
#   GB19 - Naokong.docx  ->  GB19 - Naokong.pdf
#
# Safe to re-run: a file whose PDF already exists is skipped (use -Force to convert again).
# The .docx files are opened READ-ONLY and are never changed. Nothing is uploaded: the PDFs are
# only written to the output folder (step 4 uploads them).
#
# Usage (run from the repo root; Microsoft Word must be installed and NOT already open):
#   .\scripts\migrations\convert-docx-to-pdf.ps1 -Limit 5      # first test: 5 files, then open the PDFs
#   .\scripts\migrations\convert-docx-to-pdf.ps1               # all files
#   .\scripts\migrations\convert-docx-to-pdf.ps1 -Force        # convert again even if a PDF exists
#
# Defaults: -InputDir scratch\point-docs-en\docx   -OutputDir scratch\point-docs-en\pdf
# Do not use Word while this runs: it opens each file in a hidden Word window.
# A report is written to <OutputDir>\..\convert-report.json.
#
# Exit 0 = every file converted or skipped. Exit 1 = at least one file failed (see the list at the end).

param(
    [string]$InputDir = "scratch\point-docs-en\docx",
    [string]$OutputDir = "scratch\point-docs-en\pdf",
    [int]$Limit = 0,
    [switch]$Force,
    [switch]$AllowRunningWord,
    [switch]$ShowWord,
    # Export = ExportAsFixedFormat (default). SaveAs = Document.SaveAs2 as PDF: try it if Export hangs.
    [ValidateSet("Export", "SaveAs")][string]$Method = "Export"
)

$ErrorActionPreference = "Stop"

# Word constants
$wdExportFormatPDF = 17
$wdDoNotSaveChanges = 0
$wdAlertsNone = 0
$msoAutomationSecurityForceDisable = 3   # no macros run in the opened documents
$RestartWordEvery = 100                  # quit and start Word again every N files (avoids slowdowns)

if (-not (Test-Path -LiteralPath $InputDir -PathType Container)) {
    Write-Host "Input folder not found: $InputDir (run this from the repo root)" -ForegroundColor Red
    exit 1
}
$inputPath = (Resolve-Path -LiteralPath $InputDir).Path
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$outputPath = (Resolve-Path -LiteralPath $OutputDir).Path

if (-not $AllowRunningWord -and (Get-Process WINWORD -ErrorAction SilentlyContinue)) {
    Write-Host "Word is already running. Close all Word windows first (or use -AllowRunningWord)." -ForegroundColor Red
    exit 1
}

$allFiles = @(Get-ChildItem -LiteralPath $inputPath -Filter "*.docx" -File |
    Where-Object { $_.Name -notlike '~$*' } |
    Sort-Object Name)
if ($allFiles.Count -eq 0) {
    Write-Host "No .docx files found in $inputPath" -ForegroundColor Red
    exit 1
}

# Files downloaded from the internet carry a "blocked" mark that can stop Word automation.
$allFiles | ForEach-Object { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue }

$toConvert = @()
$skipped = @()
foreach ($f in $allFiles) {
    $pdf = Join-Path $outputPath ($f.BaseName + ".pdf")
    if ((Test-Path -LiteralPath $pdf) -and -not $Force) { $skipped += $f.Name } else { $toConvert += $f }
}
if ($Limit -gt 0 -and $toConvert.Count -gt $Limit) { $toConvert = @($toConvert | Select-Object -First $Limit) }

Write-Host "--- DOCX -> PDF with Microsoft Word ---" -ForegroundColor Cyan
Write-Host "Input:  $inputPath  ($($allFiles.Count) .docx files)"
Write-Host "Output: $outputPath"
Write-Host "To convert now: $($toConvert.Count)   already converted (skipped): $($skipped.Count)$(if ($Limit -gt 0) { "   (limit $Limit)" })"

function Start-WordApp {
    Write-Host "Starting Word$(if ($ShowWord) { ' (visible)' } else { ' (hidden)' })..." -ForegroundColor DarkGray
    $app = New-Object -ComObject Word.Application
    # -ShowWord: Word's window is visible, so a dialog that blocks it can be seen and answered.
    $app.Visible = [bool]$ShowWord
    $app.DisplayAlerts = $wdAlertsNone
    $app.AutomationSecurity = $msoAutomationSecurityForceDisable
    return $app
}

function Stop-WordApp($app) {
    if ($null -eq $app) { return }
    try { $app.Quit($wdDoNotSaveChanges) } catch { }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) } catch { }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$converted = @()
$failed = @()
$word = $null
$count = 0
$started = Get-Date

try {
    if ($toConvert.Count -gt 0) { $word = Start-WordApp }

    foreach ($f in $toConvert) {
        $count++
        if ($count -gt 1 -and (($count - 1) % $RestartWordEvery) -eq 0) {
            Stop-WordApp $word
            $word = Start-WordApp
        }

        $pdf = Join-Path $outputPath ($f.BaseName + ".pdf")
        $doc = $null
        $clock = Get-Date
        # Printed BEFORE the conversion, so a file that hangs is visible on screen.
        Write-Host ("[{0}/{1}] {2} ... " -f $count, $toConvert.Count, $f.Name) -NoNewline
        try {
            # Open(FileName, ConfirmConversions=false, ReadOnly=true, AddToRecentFiles=false)
            $doc = $word.Documents.Open($f.FullName, $false, $true, $false)
            Write-Host "opened, saving PDF ... " -NoNewline
            if ($Method -eq "SaveAs") {
                $doc.SaveAs2($pdf, $wdExportFormatPDF)   # 17 = PDF
            }
            else {
                $doc.ExportAsFixedFormat($pdf, $wdExportFormatPDF)
            }

            if (-not (Test-Path -LiteralPath $pdf) -or (Get-Item -LiteralPath $pdf).Length -le 0) {
                throw "Word did not produce a PDF (missing or empty)"
            }
            $seconds = [math]::Round(((Get-Date) - $clock).TotalSeconds, 1)
            Write-Host ("ok ({0}s)" -f $seconds) -ForegroundColor Green
            $converted += $f.Name
        }
        catch {
            Write-Host ("FAILED: {0}" -f $_.Exception.Message) -ForegroundColor Red
            $failed += [PSCustomObject]@{ File = $f.Name; Error = $_.Exception.Message }
            if (Test-Path -LiteralPath $pdf) { Remove-Item -LiteralPath $pdf -Force -ErrorAction SilentlyContinue }
        }
        finally {
            if ($null -ne $doc) {
                try { $doc.Close($wdDoNotSaveChanges) } catch { }
                try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) } catch { }
            }
        }
    }
}
finally {
    Stop-WordApp $word
}

$elapsed = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
$stillRunning = @(Get-Process WINWORD -ErrorAction SilentlyContinue).Count

$report = [PSCustomObject]@{
    date       = (Get-Date).ToString("o")
    inputDir   = $inputPath
    outputDir  = $outputPath
    docxTotal  = $allFiles.Count
    converted  = $converted.Count
    skipped    = $skipped.Count
    failed     = $failed.Count
    failedList = $failed
    convertedList = $converted
}
$reportFile = Join-Path (Split-Path -Parent $outputPath) "convert-report.json"
$report | ConvertTo-Json -Depth 4 | Set-Content -Path $reportFile -Encoding utf8

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "docx files: $($allFiles.Count)   converted now: $($converted.Count)   skipped (PDF exists): $($skipped.Count)   failed: $($failed.Count)   time: $elapsed min"
Write-Host "PDFs in output folder: $((Get-ChildItem -LiteralPath $outputPath -Filter '*.pdf' -File).Count)"
Write-Host "Report: $reportFile"
if ($stillRunning -gt 0) { Write-Host "Note: $stillRunning WINWORD process(es) still running - close them in Task Manager if you did not open Word yourself." -ForegroundColor Yellow }

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed files (open them in Word, fix or re-save, then run the script again):" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  $($_.File): $($_.Error)" -ForegroundColor Red }
    exit 1
}
exit 0
