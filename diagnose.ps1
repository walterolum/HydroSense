# diagnose.ps1 — OneDrive Sync Conflict Diagnostics
# Run as Administrator: powershell -ExecutionPolicy Bypass -File diagnose.ps1

Write-Host "=== ONEDRIVE SYNC DIAGNOSTIC (Run as Admin) ===" -ForegroundColor Cyan

# 1. Stop processes that lock files
Write-Host "`n[1] Checking for locking processes..." -ForegroundColor Yellow
$lockProcesses = @("python", "node", "npm", "uvicorn", "ngrok", "git")
foreach ($p in $lockProcesses) {
    $procs = Get-Process -Name $p -ErrorAction SilentlyContinue
    if ($procs) {
        Write-Host "  WARNING: $p is running (PID: $($procs.Id -join ', '))" -ForegroundColor Red
    }
}

# 2. Check OneDrive sync status
Write-Host "`n[2] OneDrive sync status..." -ForegroundColor Yellow
$od = Get-Process -Name "OneDrive" -ErrorAction SilentlyContinue
if ($od) {
    Write-Host "  OneDrive is running (PID: $($od.Id))" -ForegroundColor Green
} else {
    Write-Host "  OneDrive is NOT running" -ForegroundColor Red
}

# 3. Find files with path length > 240 chars
Write-Host "`n[3] Files exceeding safe path length..." -ForegroundColor Yellow
$longPaths = Get-ChildItem -Path ".\" -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName.Length -gt 240 } |
    Select-Object -First 20
if ($longPaths) {
    Write-Host "  Found $($longPaths.Count) files with long paths (showing first 20):" -ForegroundColor Red
    $longPaths | ForEach-Object { Write-Host "    $($_.FullName.Length) chars - $($_.FullName)" }
} else {
    Write-Host "  No long-path files found" -ForegroundColor Green
}

# 4. Check for symlinks/reparse points
Write-Host "`n[4] Reparse points / symlinks in project..." -ForegroundColor Yellow
$reparse = Get-ChildItem -Path ".\" -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Attributes -match "ReparsePoint" } |
    Select-Object -First 20
if ($reparse) {
    Write-Host "  Found $($reparse.Count) reparse points:" -ForegroundColor Red
    $reparse | ForEach-Object { Write-Host "    $($_.FullName) -> $($_.Target)" }
} else {
    Write-Host "  No reparse points found" -ForegroundColor Green
}

# 5. OneDrive known folders
Write-Host "`n[5] Checking known folder redirection..." -ForegroundColor Yellow
$knownFolders = @(
    [Environment]::GetFolderPath("Desktop"),
    [Environment]::GetFolderPath("MyDocuments"),
    [Environment]::GetFolderPath("MyPictures")
)
foreach ($k in $knownFolders) {
    if ($k -match "OneDrive") {
        Write-Host "  $k is redirected to OneDrive" -ForegroundColor Yellow
    }
}

# 6. Environment info
Write-Host "`n[6] Environment summary:" -ForegroundColor Cyan
Write-Host "  ComputerName: $env:COMPUTERNAME"
Write-Host "  OS: $((Get-CimInstance Win32_OperatingSystem).Caption)"
Write-Host "  Project Path: $(Resolve-Path .)"
Write-Host "  OneDrive Path: $env:OneDrive"
Write-Host "  OneDriveCommercial: $env:OneDriveCommercial"
Write-Host "  Python: $(Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)"
Write-Host "  Node: $(Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)"
Write-Host "  Git: $(git --version 2>$null)"

Write-Host "`n=== DIAGNOSTIC COMPLETE ===" -ForegroundColor Cyan
