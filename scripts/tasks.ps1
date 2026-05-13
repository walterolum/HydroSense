# tasks.ps1 — Development Task Runner for Hydrosense
# Usage: .\scripts\tasks.ps1 <command>
# Commands: dev, lint, test, clean, rebuild, backup, help

param(
    [Parameter(Position=0)]
    [ValidateSet("dev", "lint", "test", "clean", "rebuild", "backup", "help")]
    [string]$Command = "help",

    [switch]$DryRun
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$venvPip = Join-Path $ProjectRoot ".venv\Scripts\pip.exe"
$frontendDir = Join-Path $ProjectRoot "frontend"

function Exec {
    param([string]$Title, [string]$Cmd)
    Write-Host "`n>> $Title" -ForegroundColor Cyan
    Write-Host "   $Cmd" -ForegroundColor DarkGray
    if (-not $DryRun) {
        Invoke-Expression $Cmd
        if (-not $?) { Write-Host "   FAILED with exit code $LASTEXITCODE" -ForegroundColor Red }
    }
}

switch ($Command) {
    "dev" {
        Exec -Title "Starting FastAPI backend" -Cmd "Start-Process powershell -ArgumentList '-NoExit -Command cd $ProjectRoot; $venvPython -m uvicorn src.backend.main:app --reload --port 8000'"
        Exec -Title "Starting React frontend" -Cmd "Start-Process powershell -ArgumentList '-NoExit -Command cd $frontendDir; npm run dev'"
        Write-Host "`nBoth servers started in separate windows." -ForegroundColor Green
        Write-Host "Backend: http://localhost:8000" -ForegroundColor Yellow
        Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
    }

    "lint" {
        Exec -Title "Python lint (ruff)" -Cmd "cd $ProjectRoot; $venvPython -m ruff check src/"
        Exec -Title "Python type check (mypy)" -Cmd "cd $ProjectRoot; $venvPython -m mypy src/"
        Exec -Title "Frontend lint" -Cmd "cd $frontendDir; npx eslint src/"
    }

    "test" {
        Exec -Title "Python tests" -Cmd "cd $ProjectRoot; $venvPython -m pytest tests/ -v"
        Exec -Title "Frontend tests" -Cmd "cd $frontendDir; npm test -- --run"
    }

    "clean" {
        Exec -Title "Clean Python caches" -Cmd "Get-ChildItem $ProjectRoot -Recurse -Directory -Filter __pycache__ | Remove-Item -Recurse -Force"
        Exec -Title "Clean pytest cache" -Cmd "Remove-Item (Join-Path $ProjectRoot '.pytest_cache') -Recurse -Force -ErrorAction SilentlyContinue"
        Exec -Title "Clean mypy cache" -Cmd "Remove-Item (Join-Path $ProjectRoot '.mypy_cache') -Recurse -Force -ErrorAction SilentlyContinue"
        Write-Host "`nCache files cleaned." -ForegroundColor Green
    }

    "rebuild" {
        Exec -Title "Full clean + rebuild" -Cmd "& (Join-Path $PSScriptRoot 'rebuild.ps1') -ProjectPath $ProjectRoot -ForcePython -ForceNode"
    }

    "backup" {
        Exec -Title "Run backup" -Cmd "& (Join-Path $PSScriptRoot 'backup.ps1') -ProjectPath $ProjectRoot"
    }

    "help" {
        Write-Host @"
HYDROSENSE Task Runner
======================
Usage: .\scripts\tasks.ps1 <command>

Commands:
  dev       Start backend + frontend dev servers
  lint      Run all linters (ruff, mypy, eslint)
  test      Run all test suites
  clean     Remove cache/artifact directories
  rebuild   Full clean + rebuild venv + node_modules
  backup    Run non-interfering backup
  help      Show this help

Options:
  -DryRun   Show commands without executing them
"@ -ForegroundColor Cyan
    }
}
