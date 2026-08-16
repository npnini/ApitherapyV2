param(
    [Parameter(Mandatory = $true, HelpMessage = "The name of the new branch to create.")]
    [string]$BranchName
)

# Set error action to stop on errors
$ErrorActionPreference = "Stop"

try {
    # Check if we are in a git repository
    git rev-parse --is-inside-work-tree > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Not a git repository." -ForegroundColor Red
        return
    }

    Write-Host "Switching to main and pulling latest..." -ForegroundColor Cyan
    git checkout main
    git pull origin main

    Write-Host "Creating and switching to new branch: $BranchName" -ForegroundColor Cyan
    git checkout -b $BranchName

    Write-Host "Successfully created and switched to branch '$BranchName'" -ForegroundColor Green
}
catch {
    Write-Host "An error occurred: $_" -ForegroundColor Red
}
