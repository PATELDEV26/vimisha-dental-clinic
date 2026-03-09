@echo off
title Remove Auto-Start - Vimisha's Dental Clinic
set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
del "%STARTUP_FOLDER%\VimishaDental.vbs"
echo Auto-start has been removed.
pause
