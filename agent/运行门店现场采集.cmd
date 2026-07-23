@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0门店现场采集代理.ps1"
echo.
pause
