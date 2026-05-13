# ──────────────────────────────────────────────────────────────────────
# rebuild.ps1 — Full rebuild of virtual env + node_modules
# PowerShell -ExecutionPolicy Bypass -File rebuild.ps1
# ──────────────────────────────────────────────────────────────────────

param(
    [string]$ProjectPath = ".",
    [switch]$ForcePython,
    [switch]$ForceNode,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$start = Get-Date

Write-Host "=== HYDROSENSE FULL REBUILD ===" -ForegroundColor Cyan
Write-Host "Target: $(Resolve-Path $ProjectPath)`n"

# Locate requirements
$reqTxt = Join-Path $ProjectPath "requirements.txt"
$reqDev = Join-Path $ProjectPath "requirements-dev.txt"
$pyProj = Join-Path $ProjectPath "pyproject.toml"
$packageJson = Join-Path $ProjectPath "frontend\package.json"
$venvPath = Join-Path $ProjectPath ".venv"
$nmPath = Join-Path $ProjectPath "frontend\node_modules"

# ── PYTHON REBUILD ──
if ($ForcePython -or (-not (Test-Path $venvPath))) {
    Write-Host "[1] Rebuilding Python virtual environment..." -ForegroundColor Yellow

    # Remove old venv
    if (Test-Path $venvPath) {
        if ($DryRun) {
            Write-Host "  [DRY-RUN] Would remove: $venvPath" -ForegroundColor DarkGray
        } else {
            Write-Host "  Removing old .venv..." -ForegroundColor DarkGray
            Remove-Item $venvPath -Recurse -Force
        }
    }

    if (-not $DryRun) {
        # Create new venv
        & python -m venv $venvPath
        if (-not $?) { throw "Failed to create virtual environment" }
        Write-Host "  Created: $venvPath" -ForegroundColor Green

        # Activate & install
        $pipPath = Join-Path $venvPath "Scripts\pip.exe"
        $pythonPath = Join-Path $venvPath "Scripts\python.exe"

        # Upgrade pip
        & $pythonPath -m pip install --upgrade pip
        if (-not $?) { Write-Host "  Warning: pip upgrade failed" -ForegroundColor Yellow }

        # Install from requirements
        if (Test-Path $reqTxt) {
            Write-Host "  Installing requirements..." -ForegroundColor Yellow
            & $pipPath install -r $reqTxt
            if (-not $?) { throw "requirements.txt install failed" }
        }
        if (Test-Path $reqDev) {
            Write-Host "  Installing dev requirements..." -ForegroundColor Yellow
            & $pipPath install -r $reqDev
        }
        if (Test-Path $pyProj -and -not (Test-Path $reqTxt)) {
            Write-Host "  Installing pyproject.toml (editable)..." -ForegroundColor Yellow
            & $pipPath install -e .
        }

        Write-Host "  Python environment ready" -ForegroundColor Green
    }
} else {
    Write-Host "[1] Python venv exists (use -ForcePython to rebuild)" -ForegroundColor DarkGray
}

# ── NODE REBUILD ──
if ($ForceNode -or (-not (Test-Path $nmPath))) {
    Write-Host "`n[2] Rebuilding Node modules..." -ForegroundColor Yellow

    $frontendDir = Join-Path $ProjectPath "frontend"

    if (-not (Test-Path $frontendDir)) {
        Write-Host "  Skipping: frontend directory not found" -ForegroundColor DarkGray
    } else {
        if ($DryRun) {
            Write-Host "  [DRY-RUN] Would rebuild node_modules in: $frontendDir" -ForegroundColor DarkGray
        } else {
            Push-Location $frontendDir
            try {
                if (Test-Path "node_modules") {
                    Write-Host "  Removing old node_modules..." -ForegroundColor DarkGray
                    Remove-Item "node_modules" -Recurse -Force
                }
                if (Test-Path "package-lock.json") {
                    Remove-Item "package-lock.json" -Force
                }

                Write-Host "  Running npm install..." -ForegroundColor Yellow
                & npm install --legacy-peer-deps
                if (-not $?) { throw "npm install failed" }

                Write-Host "  Node modules ready" -ForegroundColor Green
            } finally {
                Pop-Location
            }
        }
    }
} else {
    Write-Host "`n[2] Node modules exist (use -ForceNode to rebuild)" -ForegroundColor DarkGray
}

# ── VERIFICATION ──
Write-Host "`n[3] Verification:" -ForegroundColor Yellow

if (-not $DryRun) {
    # Python
    $pythonPath = Join-Path $venvPath "Scripts\python.exe"
    if (Test-Path $pythonPath) {
        $ver = & $pythonPath --version 2>&1
        Write-Host "  Python: $ver" -ForegroundColor Green

        # Show key packages
        $pipPath = Join-Path $venvPath "Scripts\pip.exe"
        $fastapi = & $pipPath list --format=columns 2>$null | Select-String "fastapi"
        if ($fastapi) { Write-Host "  FastAPI: $fastapi" -ForegroundColor Green }
    }

    # Node
    $nodeVer = & node --version 2>$null
    if ($nodeVer) { Write-Host "  Node: $nodeVer" -ForegroundColor Green }
    $npmVer = & npm --version 2>$null
    if ($npmVer) { Write-Host "  npm: v$npmVer" -ForegroundColor Green }
}

Write-Host "`n=== REBUILD COMPLETE ($((Get-Date)-$start | Select-Object -ExpandProperty TotalSeconds)s) ===" -ForegroundColor Cyan
