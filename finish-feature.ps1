# Usage: .\finish-feature.ps1 -Message "feat: your descriptive commit message"
param (
    [Parameter(Mandatory = $true)]
    [string]$Message
)

# Stop on errors
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
    Write-Host "📝 Staging and committing changes..." -ForegroundColor Yellow
    git add .
    # Use --allow-empty in case there are no changes but need to sync/merge anyway
    git commit -m "$Message" --allow-empty
    
    # 3. Push feature branch
    Write-Host "☁️ Pushing $currentBranch to origin..." -ForegroundColor Yellow
    git push origin $currentBranch

    # 4. Merge to main
    Write-Host "🔄 Switching to main and pulling latest..." -ForegroundColor Yellow
    git checkout main
    git pull origin main

    Write-Host "🔀 Merging $currentBranch into main..." -ForegroundColor Yellow
    git merge $currentBranch

    # 5. Push main
    Write-Host "⬆️ Pushing main to origin..." -ForegroundColor Yellow
    git push origin main

    # 6. Cleanup local branch
    Write-Host "🧹 Deleting local feature branch $currentBranch..." -ForegroundColor Yellow
    git branch -d $currentBranch

    Write-Host "`n✅ Feature '$currentBranch' successfully merged, pushed, and cleaned up!" -ForegroundColor Green
    Write-Host "You are now on branch: main" -ForegroundColor Gray
}
catch {
    Write-Host "`n❌ An error occurred during the process:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Please resolve any conflicts manually." -ForegroundColor Yellow
}
