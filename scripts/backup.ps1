# backup.ps1 — Non-Interfering Project Backup
# Schedule via Task Scheduler for nightly runs
# Does NOT backup rebuildable artifacts (.venv, node_modules, __pycache__)

param(
    [string]$ProjectPath = "C:\Dev\Hydrosense",
    [string]$BackupRoot = "C:\Backups\Hydrosense",
    [string]$RetentionDays = 30,
    [switch]$Force
)

$ErrorActionPreference = "Continue"
$dateStamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupDir = Join-Path $BackupRoot $dateStamp
$logFile = Join-Path $BackupRoot "backup_$dateStamp.log"

# ── Ensure backup destination exists
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-Host "=== HYDROSENSE BACKUP ===" -ForegroundColor Cyan
Write-Host "Source:    $ProjectPath"
Write-Host "Target:    $backupDir"
Write-Host "Retention: $RetentionDays days`n"

# ── Files/Dirs to EXCLUDE (rebuildable artifacts)
$excludeList = @(
    ".venv", "node_modules", "__pycache__", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", ".git", ".next", "dist", "build",
    "*.pyc", "*.pyo", "*.log", ".coverage", "htmlcov",
    "uploads", "temp", "data\raw", "*.db"
)

# ── Build robocopy arguments
$excludeArgs = $excludeList | ForEach-Object { "--xd", $_ }
$robocopyArgs = @(
    $ProjectPath,
    $backupDir,
    "/E",                           # Copy subdirs including empty
    "/COPY:DAT",                    # Copy Data + Attributes + Timestamps
    "/DCOPY:DAT",                   # Copy directory timestamps
    "/R:2", "/W:3",                # Retry 2x, wait 3s
    "/NP",                          # No progress (%)
    "/NFL", "/NDL",                 # No file/dir list in log
    "/LOG+:$logFile"                # Append to log
) + $excludeArgs

# ── Execute backup
Write-Host "[1] Running robocopy backup..." -ForegroundColor Yellow
& robocopy @robocopyArgs
$exitCode = $LASTEXITCODE  # robocopy uses 0-7 for success, 8+ for error

if ($exitCode -ge 8) {
    Write-Host "  ERROR: Robocopy failed with exit code $exitCode. Check: $logFile" -ForegroundColor Red
} else {
    Write-Host "  Backup completed (robocopy exit: $exitCode)" -ForegroundColor Green
}

# ── Backup pip freeze
$pipFreeze = Get-Command ".venv\Scripts\pip" -ErrorAction SilentlyContinue
if ($pipFreeze) {
    Write-Host "[2] Exporting Python dependencies..." -ForegroundColor Yellow
    & .venv\Scripts\pip freeze | Out-File (Join-Path $backupDir "requirements_backup.txt")
} else {
    Write-Host "[2] Skipping pip freeze (.venv not found)" -ForegroundColor DarkGray
}

# ── Rotate old backups
Write-Host "[3] Cleaning backups older than $RetentionDays days..." -ForegroundColor Yellow
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem $BackupRoot -Directory | Where-Object {
    $_.CreationTime -lt $cutoff
} | ForEach-Object {
    Remove-Item $_.FullName -Recurse -Force
    Write-Host "  Removed: $($_.Name)" -ForegroundColor DarkGray
}

# ── Summary
$size = (Get-ChildItem $backupDir -Recurse -File -ErrorAction SilentlyContinue |
         Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "`nBackup Size: $([math]::Round($size, 2)) MB"
Write-Host "Backup Path: $backupDir"
Write-Host "Log:         $logFile"
Write-Host "=== BACKUP COMPLETE ===" -ForegroundColor Cyan
