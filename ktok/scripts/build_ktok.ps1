# ==============================================================================
# kTok (TikTok Mod by kipsway) — Скрипт сборки для Windows (PowerShell)
# Палитра: Мозаика (#0A0A0C, лаванда #B8A7F0)
# ==============================================================================

param (
    [Parameter(Mandatory = $false)]
    [string]$InputApk = "tiktok_stock.apk",

    [Parameter(Mandatory = $false)]
    [string]$OutputApk = "..\out\kTok-by_kipsway.apk",

    [Parameter(Mandatory = $false)]
    [string]$KeystorePath = "..\keystore\kipsway.keystore",

    [Parameter(Mandatory = $false)]
    [string]$KeystorePass = "kipsway123",

    [Parameter(Mandatory = $false)]
    [string]$KeyAlias = "kipsway"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
$ToolsDir = Join-Path $RootDir "tools"
$BuildDir = Join-Path $RootDir "build"
$OutDir   = Join-Path $RootDir "out"
$PatchesDir = Join-Path $RootDir "patches"
$ResDir   = Join-Path $RootDir "res"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  🎵 Сборка kTok (TikTok by kipsway) [Палитра Мозаика]     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Magenta

# 1. Проверка каталогов
@($ToolsDir, $BuildDir, $OutDir) | ForEach-Object {
    if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

# 2. Проверка Java
try {
    $javaVer = & java -version 2>&1
    Write-Host "[✓] Java найдена: $($javaVer[0])" -ForegroundColor Green
} catch {
    Write-Error "[!] Java (JDK 17+) не найдена в PATH! Установите OpenJDK 17 или выше."
    exit 1
}

# 3. Проверка входного APK
if (-not (Test-Path $InputApk)) {
    Write-Host "[!] Исходный файл $InputApk не найден!" -ForegroundColor Yellow
    Write-Host "Поместите чистый APK TikTok в корень проекта или укажите путь: -InputApk <путь>" -ForegroundColor White
    exit 1
}

# 4. Проверка / автозагрузка инструментов
$CliJar     = Join-Path $ToolsDir "revanced-cli.jar"
$PatchesJar = Join-Path $ToolsDir "revanced-patches.jar"
$ApktoolJar = Join-Path $ToolsDir "apktool.jar"
$UberSigner = Join-Path $ToolsDir "uber-apk-signer.jar"

function Ensure-Tool ($url, $destination) {
    if (-not (Test-Path $destination)) {
        Write-Host "[↓] Загрузка $(Split-Path -Leaf $destination)..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $url -OutFile $destination -UseBasicParsing
    }
}

Ensure-Tool "https://github.com/revanced/revanced-cli/releases/download/v4.6.0/revanced-cli-4.6.0-all.jar" $CliJar
Ensure-Tool "https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_2.9.3.jar" $ApktoolJar
Ensure-Tool "https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar" $UberSigner

# 5. Проверка или генерация Keystore
if (-not (Test-Path $KeystorePath)) {
    $KeystoreDir = Split-Path -Parent $KeystorePath
    if (-not (Test-Path $KeystoreDir)) { New-Item -ItemType Directory -Path $KeystoreDir -Force | Out-Null }
    Write-Host "[!] Keystore не найден. Генерируем локальный ключ разработчика..." -ForegroundColor Yellow
    & keytool -genkey -v -keystore $KeystorePath -alias $KeyAlias -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $KeystorePass -keypass $KeystorePass -dname "CN=kipsway, OU=kTok, O=kipsway, C=RU"
    Write-Host "[✓] Ключ создан: $KeystorePath" -ForegroundColor Green
}

# 6. Распаковка и слияние ресурсов «Мозаика»
$DecompileDir = Join-Path $BuildDir "decompiled"
if (Test-Path $DecompileDir) { Remove-Item -Recurse -Force $DecompileDir }

Write-Host "[+] Шаг 1: Декомпиляция ресурсов через Apktool..." -ForegroundColor Cyan
& java -jar $ApktoolJar d -f -r $InputApk -o $DecompileDir

Write-Host "[+] Шаг 2: Внедрение брендинга kTok, цветов и иконок..." -ForegroundColor Cyan
Copy-Item -Path (Join-Path $ResDir "*") -Destination (Join-Path $DecompileDir "res") -Recurse -Force

# Подмена имени приложения в strings.xml
$StringsFiles = Get-ChildItem -Path (Join-Path $DecompileDir "res") -Filter "strings.xml" -Recurse
foreach ($file in $StringsFiles) {
    (Get-Content $file.FullName) -replace '<string name="app_name">.*?</string>', '<string name="app_name">kTok</string>' | Set-Content $file.FullName
}

Write-Host "[+] Шаг 3: Сборка модифицированного APK с новыми ресурсами..." -ForegroundColor Cyan
$ResourceModApk = Join-Path $BuildDir "tiktok_res_mod.apk"
& java -jar $ApktoolJar b $DecompileDir -o $ResourceModApk

# 7. Патчинг ReVanced CLI: Снятие знаков, Смена региона, Антиреклама, Смена пакета
Write-Host "[+] Шаг 4: Применение Smali/Dex патчей kTok..." -ForegroundColor Cyan
$PatchedUnsignedApk = Join-Path $BuildDir "ktok_patched_unsigned.apk"

# Список активных патчей строго по спецификации kTok
$PatchesArgs = @(
    "-jar", $CliJar,
    "patch",
    "--patches", $PatchesJar,
    "--options", (Join-Path $PatchesDir "patches.json"),
    "--enable", "ktok-package-rename",
    "--enable", "ktok-clean-download",
    "--enable", "ktok-region-spoof",
    "--enable", "ktok-ad-blocker",
    "--out", $PatchedUnsignedApk,
    $ResourceModApk
)

if (Test-Path $PatchesJar) {
    & java $PatchesArgs
} else {
    Write-Host "[!] revanced-patches.jar не найден. Пропуск CLI-патчинга, использование ресурсно-модифицированного APK." -ForegroundColor Yellow
    Copy-Item $ResourceModApk $PatchedUnsignedApk -Force
}

# 8. Подпись и выравнивание APK
Write-Host "[+] Шаг 5: Подпись ключом kipsway..." -ForegroundColor Cyan
& java -jar $UberSigner `
    --apks $PatchedUnsignedApk `
    --ks $KeystorePath `
    --ksPass $KeystorePass `
    --ksAlias $KeyAlias `
    --ksKeyPass $KeystorePass `
    --out $OutDir `
    --overwrite

$SignedApk = Join-Path $OutDir "ktok_patched_unsigned-aligned-signed.apk"
$FinalApk  = Join-Path $OutDir "kTok-by_kipsway.apk"

if (Test-Path $SignedApk) {
    Move-Item -Path $SignedApk -Destination $FinalApk -Force
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  🎉 Сборка kTok успешно завершена!                      " -ForegroundColor Green
Write-Host "  Файл: $FinalApk                                         " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
