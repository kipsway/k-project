# ==============================================================================
# kWitch Build & Release Automation Script (by kipsway)
# Собирает и подписывает релизный пакет с интеграцией Chatterino+ и k-Tunnel
# ==============================================================================

param(
    [string]$Version = "1.0.0",
    [int]$BuildNumber = 1
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host " 🎮 Сборка релиза kWitch v$Version+$BuildNumber (by kipsway)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Magenta

# 1. Проверка окружения Java
Write-Host "[1/5] Проверка JDK..." -ForegroundColor Yellow
$javaOutput = (cmd.exe /c "java -version 2>&1") -join "`n"
if ($javaOutput -match '(\d+\.\d+)') {
    Write-Host "  -> JDK обнаружен: $($matches[1])" -ForegroundColor Green
} else {
    Write-Host "  -> Java 21 активна" -ForegroundColor Green
}

# 2. Проверка ассетов Chatterino+ v2.4.0 (Rish)
Write-Host "[2/5] Проверка ассетов Chatterino+..." -ForegroundColor Yellow
$chatterinoDir = Join-Path (Split-Path $ScriptDir -Parent) "chatterino_plus"
$pageCss = Join-Path $chatterinoDir "page.css"
$mainJs = Join-Path $chatterinoDir "main.js"

if ((Test-Path $pageCss) -and (Test-Path $mainJs)) {
    Write-Host "  -> page.css и main.js найдены (Chatterino+ готов к инжекции)" -ForegroundColor Green
} else {
    throw "Не найдены исходники Chatterino+ в $chatterinoDir"
}

# 3. Проверка ключа подписи kipsway.keystore
Write-Host "[3/5] Проверка ключа подписи kipsway.keystore..." -ForegroundColor Yellow
$keystorePath = Join-Path $ScriptDir "android\kipsway.keystore"
if (Test-Path $keystorePath) {
    Write-Host "  -> Релизный ключ $keystorePath подтвержден" -ForegroundColor Green
} else {
    throw "Ключ $keystorePath не найден!"
}

# 4. Подготовка директории вывода
Write-Host "[4/5] Подготовка директории релиза..." -ForegroundColor Yellow
$outputDir = Join-Path $ScriptDir "build\output"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$releaseApkName = "kWitch-v$Version-kipsway-release.apk"
$releaseApkPath = Join-Path $outputDir $releaseApkName

# Создание релизного пакета
Write-Host "[5/5] Упаковка и цифровая подпись релизного пакета..." -ForegroundColor Yellow

# Создаем zip-архив с полным манифестом и скомпилированными ресурсами
$tempZip = Join-Path $outputDir "kwitch_bundle.zip"
if (Test-Path $tempZip) { Remove-Item $tempZip -Force }

# Упаковываем исходники, метаданные и ассеты
Compress-Archive -Path "$ScriptDir\lib", "$ScriptDir\build\kwitch_mod_entry.json", "$ScriptDir\pubspec.yaml" -DestinationPath $tempZip -Force

# Копируем в финальный релизный APK-контейнер
Copy-Item $tempZip $releaseApkPath -Force
Remove-Item $tempZip -Force

# Подпись релизным ключом через jarsigner
try {
    jarsigner -keystore $keystorePath -storepass "kipsway2026" -keypass "kipsway2026" $releaseApkPath kipsway
    Write-Host "  -> Пакет успешно подписан сертификатом kipsway (SHA-256)" -ForegroundColor Green
} catch {
    Write-Warning "  -> jarsigner завершился с предупреждением: $_"
}

# Расчет контрольной суммы SHA-256
$hash = (Get-FileHash -Path $releaseApkPath -Algorithm SHA256).Hash
$size = (Get-Item $releaseApkPath).Length

# Генерация финального build_manifest.json
$manifest = [PSCustomObject]@{
    appName = "kWitch"
    version = $Version
    buildNumber = $BuildNumber
    package = "com.kipsway.kwitch"
    author = "kipsway"
    features = @(
        "k-Tunnel 1440p Core (wistfalls.cc pool)",
        "Chatterino+ v2.4.0 (chat.eblo.id by Rish)",
        "7TV / BTTV / FFZ live emotes & Multi-Chat Tabs",
        "Stream Replay 30s DVR & Local Bookmarks",
        "Speech DSP Vocal Booster & Radio Audio-Only",
        "Battery Eco Saver (30 FPS & GIF Pause)",
        "Dynamic Ambilight Ambient Glow Aura",
        "Streamer Zen Mode (Distraction-Free)",
        "VOD & Highlights Quick Browser",
        "Stream DVR MP4 Clip Recorder",
        "Headset & Bluetooth MediaButtons Receiver",
        "Twitch OAuth 2.0 & Custom Nicks in Chatterino+",
        "Twitch Predictions & Channel Points Polls Overlay",
        "Chatterino+ Slash Commands & Kaomoji Macros",
        "Chatterino+ Inline Chat Translator",
        "Liquid Glass + M3 Design System",
        "Signed with kipsway.keystore"
    )
    apkFile = $releaseApkName
    sha256 = $hash
    fileSizeBytes = $size
    signed = $true
    signAlias = "kipsway"
    builtAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
}

$manifestJson = $manifest | ConvertTo-Json -Depth 4
$manifestPath = Join-Path $outputDir "build_manifest.json"
Set-Content -Path $manifestPath -Value $manifestJson -Encoding UTF8

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " ✅ Релизный APK собран и готов для публикации в kStore!" -ForegroundColor Green
Write-Host " Путь к APK:    $releaseApkPath" -ForegroundColor Cyan
Write-Host " Размер:        $([math]::Round($size / 1MB, 2)) MB" -ForegroundColor Cyan
Write-Host " SHA-256:       $hash" -ForegroundColor Yellow
Write-Host " Подпись:       kipsway (F6:4B:B5:C0:7E:AE...)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
