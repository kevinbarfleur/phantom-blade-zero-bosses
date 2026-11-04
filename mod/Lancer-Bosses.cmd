@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Lancer-Bosses.ps1"
if errorlevel 1 pause
