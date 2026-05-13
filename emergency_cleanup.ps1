# emergency_cleanup.ps1
# Safe project cleanup — run ONLY after stopping dev servers
# PowerShell -ExecutionPolicy Bypass -File emergency_cleanup.ps1

param(
    [string]$ProjectPath = ".",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$start = Get-Date

Write-Host "=== HYDROSENSE EMERGENCY CLEANUP ===" -ForegroundColor Cyan
Write-Host "Target: $ProjectPath`n"

# 1. Kill dev processes
Write-Host "[1] Stopping development processes..." -ForegroundColor Yellow
$killTargets = @("python", "node", "npm", "npx", "uvicorn", "gunicorn")
foreach ($t in $killTargets) {
    $p = Get-Process -Name $t -ErrorAction SilentlyContinue
    if ($p) {
        if ($Force) {
            Stop-Process -Name $t -Force
            Write-Host "  Killed: $t" -ForegroundColor Red
        } else {
            Write-Host "  Running: $t (PID: $($p.Id)) — use -Force to kill" -ForegroundColor Yellow
        }
    }
}

# 2. Remove Python cache files
Write-Host "`n[2] Removing Python cache files..." -ForegroundColor Yellow
$pycache = Get-ChildItem -Path $ProjectPath -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue
$pycache | ForEach-Object {
    Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Removed: $($_.FullName)" -ForegroundColor DarkGray
}

# 3. Remove .pyc files
Get-ChildItem -Path $ProjectPath -Recurse -Filter "*.pyc" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

# 4. Remove egg-info
Get-ChildItem -Path $ProjectPath -Recurse -Directory -Filter "*.egg-info" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

# 5. Clean node_modules if exists
$nm = Join-Path $ProjectPath "node_modules"
if (Test-Path $nm) {
    Write-Host "`n[5] node_modules exists at: $nm" -ForegroundColor Yellow
    $size = (Get-ChildItem $nm -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "  Current size: $([math]::Round($size, 2)) MB"
    if ($Force) {
        Write-Host "  Removing node_modules..." -ForegroundColor Red
        Remove-Item $nm -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "`n=== CLEANUP COMPLETE ($((Get-Date)-$start | Select-Object -ExpandProperty TotalSeconds)s) ===" -ForegroundColor Cyan
