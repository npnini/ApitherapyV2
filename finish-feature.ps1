# Usage: .\finish-feature.ps1 -Message "feat: your descriptive commit message"
param (
    [Parameter(Mandatory = $true)]
    [string]$Message
)

# Stop on errors for PowerShell commands
$ErrorActionPreference = "Stop"

try {
    # 1. Get current branch name
    $currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($currentBranch -eq "main" -or $currentBranch -eq "master") {
        Write-Host "❌ Error: You are already on main/master. Please run this from a feature branch." -ForegroundColor Red
        return
    }

    Write-Host "🚀 Finishing feature on branch: $currentBranch" -ForegroundColor Cyan

    # 2. Stage and commit
    Write-Host "📝 1. Staging and committing changes..." -ForegroundColor Yellow
    git add .
    if ($LASTEXITCODE -ne 0) { throw "git add failed" }
    
    git commit -m "$Message" --allow-empty
    if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
    
    # 3. Push feature branch
    Write-Host "☁️ 2. Pushing $currentBranch to origin..." -ForegroundColor Yellow
    git push origin $currentBranch
    if ($LASTEXITCODE -ne 0) { throw "git push feature branch failed" }

    # 4. Switch to main
    Write-Host "🔄 3. Switching to main and pulling latest..." -ForegroundColor Yellow
    git checkout main
    if ($LASTEXITCODE -ne 0) { throw "git checkout main failed" }
    
    # Double check we are actually on main
    $targetBranch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($targetBranch -ne "main") {
        throw "Failed to switch to main branch. Currently on: $targetBranch"
    }

    git pull origin main
    if ($LASTEXITCODE -ne 0) { throw "git pull main failed" }

    # 5. Merge feature branch
    Write-Host "🔀 4. Merging $currentBranch into main..." -ForegroundColor Yellow
    git merge $currentBranch
    if ($LASTEXITCODE -ne 0) { throw "git merge failed" }

    # 6. Push main
    Write-Host "⬆️ 5. Pushing main to origin..." -ForegroundColor Yellow
    git push origin main
    if ($LASTEXITCODE -ne 0) { throw "git push main failed" }

    # 7. Cleanup local branch
    Write-Host "🧹 6. Deleting local feature branch $currentBranch..." -ForegroundColor Yellow
    git branch -d $currentBranch

    Write-Host "`n✅ Feature '$currentBranch' successfully merged and pushed!" -ForegroundColor Green
    Write-Host "You are now on branch: main" -ForegroundColor Gray
}
catch {
    Write-Host "`n❌ An error occurred:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "`nStatus summary:" -ForegroundColor Yellow
    git status -s
    Write-Host "Current Branch: $((git rev-parse --abbrev-ref HEAD))"
}
