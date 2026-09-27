@echo off
title AI-ASFA - Database Importer
cd /d "%~dp0"

echo =====================================================================
echo                AI-ASFA - MySQL Database Setup
echo =====================================================================
echo.
echo This script imports 'timetable_db.sql' into your local MySQL server.
echo.
set /p DB_USER="Enter MySQL Username [default: root]: "
if "%DB_USER%"=="" set DB_USER=root

set /p DB_PASS="Enter MySQL Password [default: root12345678]: "
if "%DB_PASS%"=="" set DB_PASS=root12345678

set /p DB_NAME="Enter MySQL Database Name [default: timetable_db]: "
if "%DB_NAME%"=="" set DB_NAME=timetable_db

echo.
echo Creating database %DB_NAME% if it does not exist...
mysql -u %DB_USER% -p%DB_PASS% -e "CREATE DATABASE IF NOT EXISTS %DB_NAME% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

if %errorlevel% neq 0 (
    echo [ERROR] Failed to connect to MySQL. Please check your credentials and make sure MySQL service is running.
    pause
    exit /b 1
)

echo Importing timetable_db.sql into %DB_NAME%...
mysql -u %DB_USER% -p%DB_PASS% %DB_NAME% < timetable_db.sql

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Database %DB_NAME% imported successfully!
) else (
    echo.
    echo [ERROR] Failed to import database.
)

pause
