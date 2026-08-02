@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Activation-Menu.ps1"
if errorlevel 1 pause
