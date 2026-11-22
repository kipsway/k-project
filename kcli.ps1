# ==============================================================================
# k-CLI: Интерактивный терминал управления экосистемой (by kipsway)
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Show-Header {
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Magenta
    Write-Host "  🪐 k-Ecosystem CLI Manager (by kipsway)" -ForegroundColor Cyan
    Write-Host "  Сетевое ядро: k-Tunnel | Дизайн: Мозаика + Material You 3" -ForegroundColor DarkGray
    Write-Host "==========================================================" -ForegroundColor Magenta
    Write-Host ""
}

function Show-Menu {
    Show-Header
    Write-Host "  [1] 🧪 Запустить тесты целостности экосистемы (23 проверки)" -ForegroundColor Green
    Write-Host "  [2] 🔄 Синхронизировать ключи подписи и обновить манифест" -ForegroundColor Yellow
    Write-Host "  [3] 📺 Собрать клиент kTube (YouTube 4K k-Tunnel)" -ForegroundColor Cyan
    Write-Host "  [4] 💬 Настроить и пропатчить kGram (Telegram Мозаика + RX Playa)" -ForegroundColor Magenta
    Write-Host "  [5] 📦 Сформировать дистрибутивный пакет в dist/" -ForegroundColor DarkCyan
    Write-Host "  [6] 🌐 Открыть веб-лендинг экосистемы в браузере" -ForegroundColor Blue
    Write-Host "  [7] 🔍 Проверить статус Git репозитория" -ForegroundColor White
    Write-Host "  [8] 🚀 Запустить локальный диагностический демон k-Tunnel" -ForegroundColor Magenta
    Write-Host "  [0] 🚪 Выход" -ForegroundColor DarkGray
    Write-Host ""
}

do {
    Show-Menu
    $choice = Read-Host "Выберите действие [0-6]"
    
    switch ($choice) {
        "1" {
            Show-Header
            & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $RootDir "test_ecosystem.ps1")
            Write-Host "`nНажмите Enter для возврата в меню..." -ForegroundColor DarkGray
            [void][Console]::ReadLine()
        }
        "2" {
            Show-Header
            & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $RootDir "build_ecosystem.ps1")
            Write-Host "`nНажмите Enter для возврата в меню..." -ForegroundColor DarkGray
            [void][Console]::ReadLine()
        }
        "3" {
            Show-Header
            & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $RootDir "ktube\build\build_ktube.ps1")
            Write-Host "`nНажмите Enter для возврата в меню..." -ForegroundColor DarkGray
            [void][Console]::ReadLine()
        }
        "4" {
            Show-Header
            & powershell.exe -ExecutionPolicy Bypass -File (Join-Path $RootDir "tools\export_dist_bundle.ps1")
            Write-Host "`nНажмите Enter для возврата в меню..." -ForegroundColor DarkGray
            [void][Console]::ReadLine()
        }
        "5" {
            $landingPath = Join-Path $RootDir "landing\index.html"
            Write-Host "Открытие лендинга: $landingPath" -ForegroundColor Green
            Start-Process $landingPath
            Start-Sleep -Seconds 1
        }
        "6" {
            Show-Header
            git status
            Write-Host "`nПоследний коммит:" -ForegroundColor Yellow
            git log -1 --oneline
            Write-Host "`nНажмите Enter для возврата в меню..." -ForegroundColor DarkGray
            [void][Console]::ReadLine()
        }
        "7" {
            Show-Header
            python (Join-Path $RootDir "ktube\k-tunnel\run_ktunnel_local.py")
            Write-Host "`nНажмите Enter для возврата в меню..." -ForegroundColor DarkGray
            [void][Console]::ReadLine()
        }
        "0" {
            Write-Host "`nЗавершение работы k-CLI. Удачи!" -ForegroundColor Magenta
            break
        }
        default {
            Write-Host "Неверный выбор. Попробуйте снова." -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
} while ($choice -ne "0")
