# ==============================================================================
# k-Ecosystem Master Build & Orchestration Pipeline (by kipsway)
# Orchestrates: kStore, kTube, kWitch, kGram, kTok
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MasterKeystore = Join-Path $RootDir "ktube\build\kipsway.keystore"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  🪐 k-Ecosystem Master Orchestrator (by kipsway)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Magenta

# 1. Проверка окружения
Write-Host "`n[1/4] Проверка базового окружения..." -ForegroundColor Yellow
$javaCmd = Get-Command java -ErrorAction SilentlyContinue

if ($javaCmd) {
    Write-Host "  - Java Runtime: OK ($($javaCmd.Source))" -ForegroundColor Green
} else {
    Write-Error "Java 17+ не найдена в PATH!"
    exit 1
}

# 2. Синхронизация единого релизного ключа kipsway.keystore
Write-Host "`n[2/4] Синхронизация единого ключа подписи (kipsway.keystore)..." -ForegroundColor Yellow
if (Test-Path $MasterKeystore) {
    Write-Host "  - Мастер-ключ: $MasterKeystore" -ForegroundColor Green

    $targetKeystoreDirs = @(
        (Join-Path $RootDir "kwitch\android"),
        (Join-Path $RootDir "ktok\scripts"),
        (Join-Path $RootDir "kstore\android"),
        (Join-Path $RootDir "kgram\signing")
    )

    foreach ($dir in $targetKeystoreDirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
        }
        $dest = Join-Path $dir "kipsway.keystore"
        Copy-Item -Path $MasterKeystore -Destination $dest -Force
        Write-Host "  - Скопирован в: $dest" -ForegroundColor DarkGray
    }
} else {
    Write-Error "Мастер-ключ $MasterKeystore не найден!"
    exit 1
}

# 3. Верификация модулей экосистемы
Write-Host "`n[3/4] Верификация компонентов экосистемы..." -ForegroundColor Yellow

$apps = @(
    @{
        Id = "kstore"
        Name = "kStore"
        Package = "com.kipsway.kstore"
        Version = "1.0.0"
        Role = "Каталог и установщик (Жидкое стекло + M3 + палитра Chatterino+)"
        Path = (Join-Path $RootDir "kstore")
    },
    @{
        Id = "ktube"
        Name = "kTube"
        Package = "com.kipsway.ktube"
        Version = "1.0.0"
        Role = "YouTube без рекламы со встроенным ядром k-Tunnel 4K и SponsorBlock"
        Path = (Join-Path $RootDir "ktube")
    },
    @{
        Id = "kwitch"
        Name = "kWitch"
        Package = "com.kipsway.kwitch"
        Version = "1.0.0"
        Role = "Twitch со встроенным чатом Chatterino+ (Rish) и туннелем 1440p"
        Path = (Join-Path $RootDir "kwitch")
    },
    @{
        Id = "kgram"
        Name = "kGram"
        Package = "org.kipsway.kgram"
        Version = "10.9.1"
        Role = "Форк Telegram на базе NimarkoGram с туннелем k-Tunnel и RX Playa"
        Path = (Join-Path $RootDir "kgram")
    },
    @{
        Id = "ktok"
        Name = "kTok"
        Package = "com.kipsway.ktok"
        Version = "34.0.0"
        Role = "TikTok без водяных знаков, со сменой региона и вырезкой рекламы"
        Path = (Join-Path $RootDir "ktok")
    }
)

foreach ($app in $apps) {
    if (Test-Path $app.Path) {
        Write-Host "  [$($app.Name)] $($app.Package) v$($app.Version) — ГОТОВ" -ForegroundColor Green
    } else {
        Write-Host "  [$($app.Name)] Каталог не найден: $($app.Path)" -ForegroundColor Red
    }
}

# 4. Генерация мастер-манифеста экосистемы
Write-Host "`n[4/4] Формирование мастер-манифеста ECOSYSTEM_MANIFEST.json..." -ForegroundColor Yellow
$manifest = [PSCustomObject]@{
    EcosystemName = "k-Ecosystem"
    Author = "kipsway"
    ReleaseDate = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    DesignSystem = "Liquid Glass + Material You 3 + Chatterino+ (Mosaic by Rish)"
    NetworkCore = "k-Tunnel Embedded (Selective Loopback Proxy)"
    SigningCertificate = @{
        Keystore = "kipsway.keystore"
        Alias = "kipsway"
        Algorithm = "RSA-2048 / SHA384withRSA"
        ValidityDays = 10000
    }
    Applications = $apps
}

$manifestPath = Join-Path $RootDir "ECOSYSTEM_MANIFEST.json"
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  🎉 Вся экосистема k-Ecosystem синхронизирована!" -ForegroundColor Green
Write-Host "  Манифест: $manifestPath" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green
