@echo off
chcp 65001 > nul
title k-Ecosystem Master Orchestrator (by kipsway)
echo ==========================================================
echo   k-Ecosystem Master Orchestrator (by kipsway)
echo ==========================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_ecosystem.ps1"
echo.
pause
