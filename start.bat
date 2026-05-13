@echo off
setlocal enabledelayedexpansion
title HYDROSENSE - System Launcher
color 1F

:: ═══════════════════════════════════════════════════════════════
:: HYDROSENSE v2.0 — Production Startup Sequence
:: ═══════════════════════════════════════════════════════════════

echo.
echo  ============================================================
echo   HYDROSENSE — Climate-Resilient Rural Water System v2.0
echo   Starting all services...
echo  ============================================================
echo.

set "ROOT=%~dp0"

:: ─────────────────────────────────────────────────────────────
:: PRE-FLIGHT CHECKS
:: ─────────────────────────────────────────────────────────────

where node >nul 2>&1
if errorlevel 1 ( echo  [ERROR] Node.js not found. Run SETUP.BAT first. & pause & exit /b 1 )

if not exist "%ROOT%server\node_modules" (
    echo  [ERROR] Server packages not installed. Run SETUP.BAT first.
    pause & exit /b 1
)
if not exist "%ROOT%client\node_modules" (
    echo  [ERROR] Client packages not installed. Run SETUP.BAT first.
    pause & exit /b 1
)

:: ─────────────────────────────────────────────────────────────
:: STEP 1 — Clean up stale processes on our ports
:: ─────────────────────────────────────────────────────────────
echo [1/8] Cleaning up existing processes...

:: Kill only specific processes on our ports (not all node.exe)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5000 "') do (
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 "') do (
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 "') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo   Ports cleared

:: ─────────────────────────────────────────────────────────────
:: STEP 2 — Verify SQLite native module
:: ─────────────────────────────────────────────────────────────
echo [2/8] Checking database module compatibility...
cd /d "%ROOT%server"
node -e "require('better-sqlite3')" >nul 2>&1
if errorlevel 1 (
    echo        Rebuilding native module...
    call npm rebuild better-sqlite3 >nul 2>&1
    if errorlevel 1 (
        echo  [ERROR] Database module build failed.
        pause & exit /b 1
    )
)
echo   Database module OK

:: ─────────────────────────────────────────────────────────────
:: STEP 3 — Start Backend API (port 5000)
:: ─────────────────────────────────────────────────────────────
echo [3/8] Starting Backend API Server...
start "HYDROSENSE Backend" /min cmd /k "cd /d "%ROOT%server" && node index.js"
timeout /t 4 /nobreak >nul

:: Verify backend is listening
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5000 "') do (
    set BACKEND_PID=%%a
)
if defined BACKEND_PID (
    echo   Backend API  : http://localhost:5000  [PID !BACKEND_PID!]
) else (
    echo  [WARN] Backend may not be ready yet
)

:: ─────────────────────────────────────────────────────────────
:: STEP 4 — Start AI Service (port 8000)
:: ─────────────────────────────────────────────────────────────
echo [4/8] Starting AI Service...

:: Find Python: prefer venv, then system
set "PYTHON="

if exist "%ROOT%ai-service\.venv\Scripts\python.exe" (
    "%ROOT%ai-service\.venv\Scripts\python.exe" --version >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON=%ROOT%ai-service\.venv\Scripts\python.exe"
        goto :python_found
    )
)

where py >nul 2>&1
if not errorlevel 1 ( set "PYTHON=py" & goto :auto_venv )

where python3 >nul 2>&1
if not errorlevel 1 ( set "PYTHON=python3" & goto :auto_venv )

where python >nul 2>&1
if not errorlevel 1 ( set "PYTHON=python" & goto :auto_venv )

echo  [WARN] Python not found. AI features will be offline.
echo         Install Python 3.8+ from https://python.org
goto :ai_skip

:auto_venv
echo        Setting up Python environment...
cd /d "%ROOT%ai-service"
%PYTHON% -m venv .venv >nul 2>&1
if not errorlevel 1 (
    ".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet --no-warn-script-location >nul 2>&1
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet --no-warn-script-location
    if not errorlevel 1 (
        set "PYTHON=%ROOT%ai-service\.venv\Scripts\python.exe"
    )
)

:python_found
echo   [OK] Python ready.

:: Create .env if missing
if not exist "%ROOT%ai-service\.env" (
    if exist "%ROOT%ai-service\.env.example" (
        copy "%ROOT%ai-service\.env.example" "%ROOT%ai-service\.env" >nul
        echo   Created .env from example
    )
)

:: Verify dependencies before startup
"%PYTHON%" -c "import fastapi, uvicorn; print('ok')" >nul 2>&1
if errorlevel 1 (
    echo  [WARN] AI dependencies not installed, installing...
    cd /d "%ROOT%ai-service"
    "%PYTHON%" -m pip install -r requirements.txt --quiet --no-warn-script-location
)

:: Start AI service with auto-restart loop
start "HYDROSENSE AI" /min cmd /k "cd /d "%ROOT%ai-service" && "%PYTHON%" -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info --loop asyncio"
timeout /t 8 /nobreak >nul

:: Verify AI service
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 "') do (
    set AI_PID=%%a
)
if defined AI_PID (
    echo   AI Service   : http://localhost:8000  [PID !AI_PID!]
) else (
    echo  [WARN] AI Service may not be ready yet (will auto-retry)
)
goto :ai_done

:ai_skip
echo   AI Service   : OFFLINE (system runs without it)

:ai_done

:: ─────────────────────────────────────────────────────────────
:: STEP 5 — Wait for AI service readiness (health check gate)
:: ─────────────────────────────────────────────────────────────
echo [5/8] Verifying AI service connectivity...
if defined AI_PID (
    set AI_READY=0
    for /l %%i in (1,1,15) do (
        node -e "http=require('http');http.get('http://localhost:8000/ai/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{process.exit(d.includes('\"status\"')?0:1)})}).on('error',()=>process.exit(1))" >nul 2>&1
        if not errorlevel 1 (
            set AI_READY=1
            goto :ai_ready
        )
        timeout /t 2 /nobreak >nul
    )
    :ai_ready
    if !AI_READY! equ 1 (
        echo   AI Service   : Online [Verified]
    ) else (
        echo  [WARN] AI Service health check timed out (will retry in background)
    )
) else (
    echo   AI Service   : Skipped (not started)
)

:: ─────────────────────────────────────────────────────────────
:: STEP 6 — Wait for backend readiness (health check gate)
:: ─────────────────────────────────────────────────────────────
echo [6/8] Verifying backend connectivity...
cd /d "%ROOT%server"
set BACKEND_READY=0
for /l %%i in (1,1,15) do (
    node -e "http=require('http');http.get('http://localhost:5000/api/health-check',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{process.exit(d.includes('ok')?0:1)})}).on('error',()=>process.exit(1))" >nul 2>&1
    if not errorlevel 1 (
        set BACKEND_READY=1
        goto :backend_ready
    )
    timeout /t 2 /nobreak >nul
)
:backend_ready
if !BACKEND_READY! equ 1 (
    echo   Backend Ready : Verified [OK]
) else (
    echo  [WARN] Backend health check timed out — continuing anyway
)

:: ─────────────────────────────────────────────────────────────
:: STEP 7 — Start Frontend (port 3000)
:: ─────────────────────────────────────────────────────────────
echo [7/8] Starting Frontend Application...
start "HYDROSENSE Frontend" /min cmd /k "cd /d "%ROOT%client" && npm run dev"
timeout /t 8 /nobreak >nul

:: Verify frontend
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 "') do (
    set FE_PID=%%a
)
if defined FE_PID (
    echo   Frontend App : http://localhost:3000  [PID !FE_PID!]
) else (
    echo  [WARN] Frontend may not be ready yet
)

:: ─────────────────────────────────────────────────────────────
:: STEP 8 — Launch Browser
:: ─────────────────────────────────────────────────────────────
echo [8/8] Opening browser...
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"

:: ─────────────────────────────────────────────────────────────
:: STATUS BOARD
:: ─────────────────────────────────────────────────────────────
echo.
echo  ============================================================
echo   HYDROSENSE IS RUNNING
echo  ------------------------------------------------------------
echo   Frontend App  :  http://localhost:3000
echo   Backend API   :  http://localhost:5000/api
echo   AI Service    :  http://localhost:8000  (v4.0)
echo   AI Docs       :  http://localhost:8000/docs
echo   AI Health     :  http://localhost:8000/ai/health
echo  ------------------------------------------------------------
echo   Keep minimized windows open. Close this window when done.
echo  ============================================================
echo.
pause
endlocal
