@echo off
title Setup Auto-Start - Vimisha's Dental Clinic
echo.
echo Setting up auto-start on Windows boot...
echo.

:: Create a VBS script that silently runs the server
set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set CLINIC_PATH=%~dp0

:: Create silent launcher VBS file
echo Set WshShell = CreateObject("WScript.Shell") > "%STARTUP_FOLDER%\VimishaDental.vbs"
echo WshShell.CurrentDirectory = "%CLINIC_PATH%" >> "%STARTUP_FOLDER%\VimishaDental.vbs"
echo WshShell.Run "cmd /c npm start", 0, False >> "%STARTUP_FOLDER%\VimishaDental.vbs"

echo.
echo ==========================================
echo  SUCCESS! Auto-start has been set up.
echo  Server will start automatically on boot.
echo ==========================================
echo.
pause
