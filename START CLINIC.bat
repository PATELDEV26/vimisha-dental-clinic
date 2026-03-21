@echo off
title Vimisha's Dental Clinic
echo.
echo  Starting Vimisha's Dental Clinic...
echo  Please wait 10 seconds...
echo.

cd /d "%~dp0"

:: Start clinic server silently in background
start /b /min cmd /c "npm start > server-log.txt 2>&1"

:: Wait for server to start
timeout /t 10 /nobreak > nul

:: Show connection info
echo.
echo  ==========================================
echo   Clinic is now RUNNING!
echo.
echo   Access on this computer:
echo   http://localhost:3000
echo.
echo   Access from other devices (WiFi):
echo   http://192.168.1.5:3000
echo  ==========================================

:: Open browser automatically for staff
start http://localhost:3000

echo.
echo  KEEP THIS WINDOW OPEN (you can minimize it)
echo  Closing this = clinic goes offline!
echo.
pause

