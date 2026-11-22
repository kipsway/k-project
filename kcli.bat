@echo off
chcp 65001 > nul
title k-Ecosystem CLI Manager (by kipsway)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0kcli.ps1"
