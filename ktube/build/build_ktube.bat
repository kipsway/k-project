@echo off
chcp 65001 > nul
title Сборка kTube by kipsway
echo =====================================================
echo   kTube Build Pipeline (by kipsway)
echo   Сетевое ядро: k-Tunnel ^| Оникс + Лаванда
echo =====================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_ktube.ps1"
echo.
pause
