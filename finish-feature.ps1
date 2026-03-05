# Usage: .\finish-feature.ps1 -CommitMessage "feat: your descriptive commit message"
param (
    [Parameter(Mandatory = $true)]
    [string]$CommitMessage
)

# Stop on errors
$ErrorActionPreference = "Stop"

function Check-Git {
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed with exit code $LASTEXITCODE. Please check the error above."
    }
}

try {
    # 1. Get current branch name
    $currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($currentBranch -eq "main" -or $currentBranch -eq "master") {
        Write-Host "❌ Error: You are already on main/master." -ForegroundColor Red
        return
    }

    Write-Host "🚀 Finishing feature: $currentBranch" -ForegroundColor Cyan

    # 2. Stage and commit
    Write-Host "📝 1. Staging and committing changes..." -ForegroundColor Yellow
    git add .
    Check-Git
    
    # Direct commit with quotes is more reliable in PowerShell
    git commit -m "$CommitMessage" --allow-empty
    Check-Git
    
    # 3. Push feature branch
    Write-Host "☁️ 2. Pushing $currentBranch to origin..." -ForegroundColor Yellow
    git push origin $currentBranch
    Check-Git

    # 4. Switch to main
    Write-Host "🔄 3. Switching to main and pulling latest..." -ForegroundColor Yellow
    git checkout main
    Check-Git
    
    # VERIFY we are actually on main
    $newBranch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($newBranch -ne "main") {
        throw "Failed to switch to main. You are still on $newBranch. Aborting merge."
    }

    git pull origin main
    Check-Git

    # 5. Merge feature branch
    Write-Host "🔀 4. Merging $currentBranch into main..." -ForegroundColor Yellow
    git merge $currentBranch
    Check-Git

    # 6. Push main
    Write-Host "⬆️ 5. Pushing main to origin..." -ForegroundColor Yellow
    git push origin main
    Check-Git

    # 7. Cleanup local branch
    Write-Host "🧹 6. Deleting local feature branch $currentBranch..." -ForegroundColor Yellow
    # We switch back to main just in case before deleting
    git checkout main
    git branch -d $currentBranch

    Write-Host "`n✅ Feature '$currentBranch' successfully merged and pushed!" -ForegroundColor Green
    Write-Host "You are now on branch: main" -ForegroundColor Gray
}
catch {
    Write-Host "`n❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Current Status:" -ForegroundColor Yellow
    git status -s
    Write-Host "Current Branch: $((git rev-parse --abbrev-ref HEAD))" -ForegroundColor Yellow
}
