@echo off
setlocal enabledelayedexpansion
title AI-ASFA (SKIT) - Automated Launcher
cd /d "%~dp0"

echo =====================================================================
echo               AI-ASFA - Academic Scheduling System
echo                    Sri Krishna Institute of Technology
echo =====================================================================
echo.

:: 1. Verify Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed or not in PATH!
    echo Please download and install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Verify Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is NOT installed or not in PATH!
    echo Please install Python 3.10+ and make sure to check "Add Python to PATH".
    pause
    exit /b 1
)

:: 3. Setup .env if missing
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Creating .env from .env.example...
        copy ".env.example" ".env" >nul
        echo [OK] .env created. Default DB password is 'root12345678'.
    )
)

:: 4. Check & Install Python Virtual Environment / Dependencies
if not exist ".venv\Scripts\python.exe" (
    echo [SETUP] Python virtual environment not found. Setting up .venv...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment!
        pause
        exit /b 1
    )
    echo [SETUP] Installing required Python packages...
    .\.venv\Scripts\python.exe -m pip install --upgrade pip
    .\.venv\Scripts\pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo [WARNING] Some pip packages failed to install. Continuing...
    ) else (
        echo [OK] Python dependencies installed successfully.
    )
)

:: 5. Check & Install Node Modules
if not exist "node_modules" (
    echo [SETUP] Node modules not found. Running npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install encountered errors!
        pause
        exit /b 1
    )
    echo [OK] Node modules installed successfully.
)

:: 6. Launch Application
echo.
echo =====================================================================
echo Starting AI-ASFA Desktop Application...
echo =====================================================================
call npm run desktop

if %errorlevel% neq 0 (
    echo.
    echo [INFO] Desktop window closed or encountered an issue.
    echo If Electron failed, you can run web mode with:
    echo   call .\.venv\Scripts\activate
    echo   python -m backend.app
    echo   npm run dev
    pause
)
