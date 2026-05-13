@echo off
setlocal enabledelayedexpansion
title HYDROSENSE AI Service v4.0
color 02

echo.
echo  ================================================
echo   HYDROSENSE AI Microservice v4.0
echo   Enterprise Environmental Intelligence Engine
echo  ================================================
echo.

cd /d "%~dp0"

set "PYTHON="

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" --version >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON=.venv\Scripts\python.exe"
        goto :python_found
    )
    echo  [!] Virtual environment outdated — rebuilding...
    rmdir /s /q .venv
)

where py >nul 2>&1
if not errorlevel 1 (
    py --version >nul 2>&1
    if not errorlevel 1 ( set "PYTHON=py" & goto :auto_venv )
)
where python3 >nul 2>&1
if not errorlevel 1 (
    python3 --version >nul 2>&1
    if not errorlevel 1 ( set "PYTHON=python3" & goto :auto_venv )
)
where python >nul 2>&1
if not errorlevel 1 (
    python --version >nul 2>&1
    if not errorlevel 1 (
        python -c "import sys; sys.exit(0 if sys.version_info>=(3,0) else 1)" >nul 2>&1
        if not errorlevel 1 ( set "PYTHON=python" & goto :auto_venv )
    )
)

echo  [ERROR] Python not found. Install Python 3.8+ from https://python.org
pause
exit /b 1

:auto_venv
echo  [..] Creating virtual environment...
%PYTHON% -m venv .venv
if errorlevel 1 (
    echo  [!] Could not create venv — using system Python
    goto :python_found_raw
)
echo  [OK] Virtual environment created.
echo  [..] Installing packages...
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet --no-warn-script-location
".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet --no-warn-script-location
if errorlevel 1 (
    echo  [!] Retrying package install...
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo  [ERROR] Package install failed
        pause
        exit /b 1
    )
)
set "PYTHON=.venv\Scripts\python.exe"
goto :python_found

:python_found_raw
%PYTHON% -c "import fastapi, uvicorn, httpx" >nul 2>&1
if errorlevel 1 (
    echo  [..] Installing packages...
    %PYTHON% -m pip install -r requirements.txt --user --quiet
)
echo  [OK] Using system Python directly

:python_found
:: Ensure .env exists
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  [OK] Created .env from example
    )
)

:: Verify startup dependencies
echo  [..] Verifying dependencies...
"%PYTHON%" -c "import fastapi, uvicorn, httpx, dotenv; print('All dependencies OK')" >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Missing dependencies. Run: pip install -r requirements.txt
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('"%PYTHON%" --version 2^>^&1') do set PY_VER=%%v
echo  [OK] %PY_VER%
echo  [OK] Starting HYDROSENSE AI v4.0 on http://localhost:8000
echo  [OK] Health: http://localhost:8000/ai/health
echo  [OK] Docs:   http://localhost:8000/docs
echo.
echo  Press Ctrl+C to stop.
echo.

:restart_loop
"%PYTHON%" -m uvicorn main:app --host 0.0.0.0 --port 8000 --log-level info --loop asyncio
echo.
echo  [AI Service stopped. Restarting in 5 seconds...]
timeout /t 5 /nobreak >nul
echo  [Restarting...]
goto :restart_loop

endlocal
