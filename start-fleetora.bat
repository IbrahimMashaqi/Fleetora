@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "FLEETORA_OPTIONS="
set "FLEETORA_LOCAL_INBOX=1"
:arguments
if "%~1"=="" goto run
if /I "%~1"=="neon" goto neon
if /I "%~1"=="rebuild" goto rebuild
echo Usage: start-fleetora.bat [neon] [rebuild]
exit /b 1
:neon
set "FLEETORA_LOCAL_INBOX="
set "FLEETORA_OPTIONS=%FLEETORA_OPTIONS% -Neon"
shift
goto arguments
:rebuild
set "FLEETORA_OPTIONS=%FLEETORA_OPTIONS% -Rebuild"
shift
goto arguments
:run
if defined FLEETORA_LOCAL_INBOX echo Local email inbox ^(Mailpit^): http://127.0.0.1:8025
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\fleetora.ps1" -Action start %FLEETORA_OPTIONS%
exit /b %ERRORLEVEL%
