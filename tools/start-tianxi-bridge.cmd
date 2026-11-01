@echo off
setlocal
title Tianxi bridge 11468
cd /d "%~dp0.."

rem ============================================================
rem  Tianxi (Lenovo local Qwen3) -> browser bridge launcher
rem  Tries any Python 3 first; falls back to PowerShell (always present).
rem  Usage: double-click this file.
rem ============================================================

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 tools\tianxi-bridge.py
  goto done
)

where python >nul 2>nul
if %errorlevel%==0 (
  python tools\tianxi-bridge.py
  goto done
)

where python3 >nul 2>nul
if %errorlevel%==0 (
  python3 tools\tianxi-bridge.py
  goto done
)

echo No Python found - using the built-in PowerShell bridge (no install needed).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tianxi-bridge.ps1"

:done
echo.
echo Bridge stopped. Press any key to close.
pause >nul
