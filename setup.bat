@echo off
setlocal enabledelayedexpansion
title HYDROSENSE — First-Time Setup
color 1F

echo.
echo  ============================================================
echo   HYDROSENSE — First-Time Setup
echo   Run this ONCE on each computer before starting the system.
echo  ============================================================
echo.

:: ─────────────────────────────────────────────────────────────────
:: STEP 1 — Check Node.js
:: ─────────────────────────────────────────────────────────────────
echo [1/5] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Node.js is not installed.
    echo          Download it from: https://nodejs.org  (LTS version recommended)
    echo          After installing, re-run this setup script.
    echo.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do set NODE_VER=%%v
echo  [OK] Node.js !NODE_VER! found.

where npm >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] npm not found. Reinstall Node.js from https://nodejs.org
    pause & exit /b 1
)

:: ─────────────────────────────────────────────────────────────────
:: STEP 2 — Install server Node.js packages
:: ─────────────────────────────────────────────────────────────────
echo.
echo [2/5] Installing server dependencies (Node.js)...
cd /d "%~dp0server"
call npm install --prefer-offline 2>nul || call npm install
if errorlevel 1 (
    echo  [ERROR] Server npm install failed.
    pause & exit /b 1
)

:: Verify/rebuild the native SQLite module for this Node.js version
echo        Verifying database module...
node -e "require('better-sqlite3')" >nul 2>&1
if errorlevel 1 (
    echo        Rebuilding native database module for Node.js !NODE_VER!...
    call npm rebuild better-sqlite3
    if errorlevel 1 (
        echo  [ERROR] Could not build the database module.
        echo          Install Visual Studio Build Tools from:
        echo          https://visualstudio.microsoft.com/visual-cpp-build-tools/
        pause & exit /b 1
    )
)
echo  [OK] Server packages ready.

:: ─────────────────────────────────────────────────────────────────
:: STEP 3 — Install client Node.js packages
:: ─────────────────────────────────────────────────────────────────
echo.
echo [3/5] Installing client dependencies (React / Vite)...
cd /d "%~dp0client"
call npm install --prefer-offline 2>nul || call npm install
if errorlevel 1 (
    echo  [ERROR] Client npm install failed.
    pause & exit /b 1
)
echo  [OK] Client packages ready.

:: ─────────────────────────────────────────────────────────────────
:: STEP 4 — Python + AI service setup (optional but recommended)
:: ─────────────────────────────────────────────────────────────────
echo.
echo [4/5] Setting up Python AI service...

:: ── Find Python (any version 3.8+) ───────────────────────────────
set "PYTHON="

:: Try: Python Launcher for Windows (installed with any Python on Windows)
where py >nul 2>&1
if not errorlevel 1 (
    py --version >nul 2>&1
    if not errorlevel 1 ( set "PYTHON=py" & goto :python_found )
)

:: Try: python3 command
where python3 >nul 2>&1
if not errorlevel 1 (
    python3 --version >nul 2>&1
    if not errorlevel 1 ( set "PYTHON=python3" & goto :python_found )
)

:: Try: python command (skip Windows Store placeholder which silently fails)
where python >nul 2>&1
if not errorlevel 1 (
    python --version >nul 2>&1
    if not errorlevel 1 (
        python -c "import sys; sys.exit(0 if sys.version_info>=(3,0) else 1)" >nul 2>&1
        if not errorlevel 1 ( set "PYTHON=python" & goto :python_found )
    )
)

:: Python not found — warn and skip
echo.
echo  [WARN] Python not found on this computer.
echo         The core system (water data, maps, alerts) will work without it.
echo         To enable AI features (Hydro AI chatbot, predictions), install Python:
echo           https://python.org/downloads/  (version 3.8 or newer)
echo         Then re-run this setup.
echo.
goto :python_skip

:python_found
:: ── Verify version is 3.8 or newer ───────────────────────────────
%PYTHON% -c "import sys; sys.exit(0 if sys.version_info>=(3,8) else 1)" >nul 2>&1
if errorlevel 1 (
    for /f "tokens=*" %%v in ('%PYTHON% --version 2^>^&1') do set PY_VER_STR=%%v
    echo  [WARN] Found !PY_VER_STR! but Python 3.8 or newer is required.
    echo         Download a newer version: https://python.org/downloads/
    goto :python_skip
)
for /f "tokens=*" %%v in ('%PYTHON% --version 2^>^&1') do set PY_VER_STR=%%v
echo  [OK] !PY_VER_STR! detected.

:: ── Create isolated virtual environment for AI service ───────────
cd /d "%~dp0ai-service"
echo        Creating virtual environment...

:: Remove broken/old venv if it exists
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" --version >nul 2>&1
    if errorlevel 1 (
        echo        Removing outdated virtual environment...
        rmdir /s /q .venv
    )
)

if not exist ".venv\Scripts\python.exe" (
    %PYTHON% -m venv .venv
    if errorlevel 1 (
        echo  [ERROR] Could not create virtual environment.
        echo          Make sure Python is properly installed.
        goto :python_skip
    )
    echo  [OK] Virtual environment created.
)

:: ── Upgrade pip silently ──────────────────────────────────────────
echo        Installing Python packages...
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet --no-warn-script-location

:: ── Install AI packages ───────────────────────────────────────────
".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet --no-warn-script-location
if errorlevel 1 (
    echo  [WARN] Some Python packages failed to install.
    echo         Trying again without --quiet for details...
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo  [ERROR] Python package installation failed.
        echo          AI features will be unavailable.
        goto :python_skip
    )
)
echo  [OK] Python packages installed.

:: ── Create .env if it doesn't exist ──────────────────────────────
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo  [OK] Created ai-service\.env  (add your GEMINI_API_KEY for full AI features)
)

:python_skip

:: ─────────────────────────────────────────────────────────────────
:: STEP 5 — Seed the database
:: ─────────────────────────────────────────────────────────────────
echo.
echo [5/5] Seeding database with Uganda water system data...
cd /d "%~dp0server"

if exist "watermonitor.db" (
    echo        Database already exists — skipping seed.
    echo        (Delete server\watermonitor.db and re-run setup to reset data.)
) else (
    call node seed.js
    if errorlevel 1 (
        echo  [ERROR] Database seed failed.
        pause & exit /b 1
    )
    echo  [OK] Database seeded.
)

:: ─────────────────────────────────────────────────────────────────
:: DONE
:: ─────────────────────────────────────────────────────────────────
echo.
echo  ============================================================
echo   SETUP COMPLETE!
echo  ------------------------------------------------------------
echo   Now run  START.BAT  to launch the system.
echo  ============================================================
echo.
echo   NOTE: Run this setup on every new computer you use.
echo         Your data stays in server\watermonitor.db
echo.
pause
endlocal
