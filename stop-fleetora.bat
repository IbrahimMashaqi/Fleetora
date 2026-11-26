@echo off
setlocal EnableExtensions DisableDelayedExpansion
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\fleetora.ps1" -Action stop
exit /b %ERRORLEVEL%
