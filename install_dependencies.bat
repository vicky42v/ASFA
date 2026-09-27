@echo off
title AI-ASFA - Dependency Installer
cd /d "%~dp0"

echo =====================================================================
echo           AI-ASFA - Complete Dependency Installer
echo =====================================================================
echo.

echo [1/3] Creating Python virtual environment (.venv)...
python -m venv .venv

echo [2/3] Installing Python dependencies from requirements.txt...
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip install -r requirements.txt

echo [3/3] Installing NPM packages...
call npm install

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo Created .env from .env.example
    )
)

echo.
echo =====================================================================
echo All dependencies installed successfully!
echo You can now run Launch-AI-ASFA.bat to start the system.
echo =====================================================================
pause
