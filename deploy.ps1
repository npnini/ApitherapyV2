# deploy.ps1
# Exit immediately if a command fails
$ErrorActionPreference = "Stop"

# 1. DELETE THE CACHE
Write-Host "Clearing Firebase CLI cache..." -ForegroundColor Cyan
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .firebase -ErrorAction SilentlyContinue

# 2. BUILD
Write-Host "Building the application..." -ForegroundColor Cyan
npm run build

# 3. DEPLOY
Write-Host "Deploying to Firebase (Hosting & Functions)..." -ForegroundColor Cyan
# Using --project to ensure it targets the correct Firebase project
# Added 'functions' to the --only flag for a complete release
firebase deploy --only "hosting,functions" --project apitherapyv2

Write-Host "Deployment successful!" -ForegroundColor Green
