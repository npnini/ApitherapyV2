# Export emulator data. Firebase's rename always fails on Windows with EPERM,
# but the data lands in a firebase-export-* temp folder. We just copy that.

$projectDir = $PSScriptRoot
$mainData = Join-Path $projectDir "emulator-data"
$tempPrefix = "firebase-export-"

# 1. Clean up any leftover temp folders from previous failed exports
Get-ChildItem -Path $projectDir -Directory -Filter "$tempPrefix*" | ForEach-Object {
    Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
}

# 2. Trigger export (will "fail" due to EPERM rename, but data is written to temp folder)
Write-Host "Triggering emulator export..." -ForegroundColor Cyan
firebase emulators:export ./does-not-matter 2>$null

# 3. Wait for export to finish writing
Write-Host "Waiting 10 seconds for export to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 4. Find the latest firebase-export-* folder
$exportFolders = Get-ChildItem -Path $projectDir -Directory -Filter "$tempPrefix*" | Sort-Object Name -Descending
if ($exportFolders.Count -eq 0) {
    Write-Host "ERROR: No export data found. Export may have failed." -ForegroundColor Red
    exit 1
}
$sourceDir = $exportFolders[0].FullName
Write-Host "Found export data: $sourceDir" -ForegroundColor Green

# 5. Clear emulator-data content and copy fresh export into it
Write-Host "Copying export data to emulator-data..." -ForegroundColor Cyan
if (Test-Path $mainData) {
    Get-ChildItem -Path $mainData | Remove-Item -Recurse -Force
} else {
    New-Item -ItemType Directory -Path $mainData | Out-Null
}
Get-ChildItem -Path $sourceDir | Copy-Item -Destination $mainData -Recurse -Force

# 6. Clean up temp folders
Write-Host "Cleaning up temp folders..." -ForegroundColor Cyan
Get-ChildItem -Path $projectDir -Directory -Filter "$tempPrefix*" | ForEach-Object {
    Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
}
# Also remove the dummy target if Firebase somehow created it
$dummy = Join-Path $projectDir "does-not-matter"
if (Test-Path $dummy) { Remove-Item -Recurse -Force $dummy -ErrorAction SilentlyContinue }

Write-Host "Emulator data saved successfully." -ForegroundColor Green
