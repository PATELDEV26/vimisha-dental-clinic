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
timeout /t 6 /nobreak > nul

:: Start ngrok silently in background  
start /b /min cmd /c ".\ngrok http 3000 > ngrok-log.txt 2>&1"

:: Wait for ngrok to start
timeout /t 5 /nobreak > nul

:: Get ngrok public URL and show it
echo.
echo  ==========================================
echo   Clinic is now ONLINE!
echo.
echo   Inside Clinic (WiFi):
echo   http://192.168.1.5:3000
echo.
echo   Fetching internet link... please wait...
echo  ==========================================

:: Open browser automatically for staff
start http://192.168.1.5:3000

timeout /t 3 /nobreak > nul

:: Show ngrok URL from their web interface
start http://127.0.0.1:4040

echo.
echo  Check the browser tab that just opened
echo  to see your internet link!
echo.
echo  KEEP THIS WINDOW OPEN (you can minimize it)
echo  Closing this = clinic goes offline!
echo.
pause
