# ==============================================================================
# kGram (Telegram Fork by kipsway) — Скрипт конфигурации пакета (Windows PowerShell)
# Базовый клиент: NimarkoGram (Telegram 13.2.2)
# Целевой пакет: org.kipsway.kgram
# ==============================================================================

param (
    [Parameter(Mandatory = $false)]
    [string]$SourceDir = "..\..\kgram_upstream",

    [Parameter(Mandatory = $false)]
    [string]$NewPackage = "org.kipsway.kgram",

    [Parameter(Mandatory = $false)]
    [string]$AppName = "kGram"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir   = Split-Path -Parent $ScriptDir
$ResDir    = Join-Path $RootDir "res"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  💬 Настройка пакета kGram (by kipsway)                   " -ForegroundColor Cyan
Write-Host "  Целевой пакет: $NewPackage                               " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Magenta

if (-not (Test-Path $SourceDir)) {
    Write-Host "[!] Исходный каталог $SourceDir не найден. Создаем структуру..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $SourceDir -Force | Out-Null
}

$BuildGradle = Join-Path $SourceDir "TMessagesProj\build.gradle"
$ManifestXml = Join-Path $SourceDir "TMessagesProj\src\main\AndroidManifest.xml"

# 1. Замена applicationId в build.gradle
if (Test-Path $BuildGradle) {
    Write-Host "[+] Шаг 1: Обновление applicationId в build.gradle..." -ForegroundColor Cyan
    $gradleContent = Get-Content $BuildGradle -Raw
    $gradleContent = $gradleContent -replace 'applicationId ".*?"', "applicationId `"$NewPackage`""
    $gradleContent = $gradleContent -replace 'APP_PACKAGE_NAME = ".*?"', "APP_PACKAGE_NAME = `"$NewPackage`""
    Set-Content -Path $BuildGradle -Value $gradleContent
    Write-Host "[✓] build.gradle обновлен: $NewPackage" -ForegroundColor Green
} else {
    Write-Host "[!] $BuildGradle пока не существует (будет применен при клонировании репозитория)." -ForegroundColor Yellow
}

# 2. Изоляция ContentProvider и разрешений в AndroidManifest.xml
if (Test-Path $ManifestXml) {
    Write-Host "[+] Шаг 2: Изоляция ContentProvider в AndroidManifest.xml..." -ForegroundColor Cyan
    $manifestContent = Get-Content $ManifestXml -Raw

    # Замена имени пакета
    $manifestContent = $manifestContent -replace 'package="org\.telegram\.messenger.*?"', "package=`"$NewPackage`""

    # Изоляция провайдеров для параллельной установки с оригиналом
    $manifestContent = $manifestContent -replace 'org\.telegram\.messenger\.provider', "$NewPackage.provider"
    $manifestContent = $manifestContent -replace 'org\.telegram\.messenger\.notification_image_provider', "$NewPackage.notification_image_provider"
    $manifestContent = $manifestContent -replace 'org\.telegram\.messenger\.call_file_provider', "$NewPackage.call_file_provider"
    $manifestContent = $manifestContent -replace 'org\.telegram\.messenger\.web_file_provider', "$NewPackage.web_file_provider"
    $manifestContent = $manifestContent -replace 'org\.telegram\.messenger\.fileprovider', "$NewPackage.fileprovider"

    # Изоляция кастомных разрешений
    $manifestContent = $manifestContent -replace 'org\.telegram\.messenger\.permission\.MAPS_RECEIVE', "$NewPackage.permission.MAPS_RECEIVE"

    Set-Content -Path $ManifestXml -Value $manifestContent
    Write-Host "[✓] AndroidManifest.xml изолирован от официального Telegram" -ForegroundColor Green
} else {
    Write-Host "[!] $ManifestXml пока не найден." -ForegroundColor Yellow
}

# 3. Внедрение строковых ресурсов kGram
$TargetResDir = Join-Path $SourceDir "TMessagesProj\src\main\res"
if (Test-Path $TargetResDir) {
    Write-Host "[+] Шаг 3: Внедрение русскоязычной локализации и названия $AppName..." -ForegroundColor Cyan
    Copy-Item -Path (Join-Path $ResDir "*") -Destination $TargetResDir -Recurse -Force
    Write-Host "[✓] Ресурсы kGram успешно скопированы в дерево проекта" -ForegroundColor Green
} else {
    Write-Host "[✓] Локальные ресурсы kGram готовы в: $ResDir" -ForegroundColor Green
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  🎉 Конфигурация $AppName ($NewPackage) подготовлена!   " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
