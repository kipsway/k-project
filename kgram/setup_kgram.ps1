# ==============================================================================
# kGram Setup & Configuration Script (PowerShell / Windows)
# Author: kipsway
# Project: kGram (Telegram Fork based on Ettacent/NimarkoGram)
# ==============================================================================

[CmdletBinding()]
param (
    [string]$RepoPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         kGram Configuration & Branding Tool              " -ForegroundColor Magenta
Write-Host "                    by kipsway                            " -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Determine Repository Path
if ([string]::IsNullOrWhiteSpace($RepoPath)) {
    # Check common sibling locations
    $candidate1 = Join-Path (Split-Path -Parent $ScriptDir) "kgram_upstream"
    $candidate2 = Join-Path (Split-Path -Parent $ScriptDir) "NimarkoGram"
    
    if (Test-Path $candidate1) {
        $RepoPath = $candidate1
    } elseif (Test-Path $candidate2) {
        $RepoPath = $candidate2
    } else {
        $RepoPath = $candidate1
    }
}

Write-Host "[1/5] Target repository directory: $RepoPath" -ForegroundColor Yellow

# 2. Check / Clone Upstream if needed
if (-not (Test-Path (Join-Path $RepoPath ".git"))) {
    Write-Host "[2/5] Upstream repository not found. Cloning Ettacent/NimarkoGram..." -ForegroundColor Cyan
    $env:HTTP_PROXY = ""
    $env:HTTPS_PROXY = ""
    git -c http.proxy="" -c https.proxy="" clone --filter=blob:none --depth 1 https://github.com/Ettacent/NimarkoGram.git $RepoPath
} else {
    Write-Host "[2/5] Existing Git repository verified at $RepoPath." -ForegroundColor Green
}

# 3. Ensure Branding Icons are Generated
$AssetsDir = Join-Path $ScriptDir "assets"
$Icon512 = Join-Path $AssetsDir "kgram_icon_512.png"
if (-not (Test-Path $Icon512)) {
    Write-Host "[3/5] Generating kGram 'Мозаика' branding icons..." -ForegroundColor Cyan
    python (Join-Path $ScriptDir "scripts\generate_icons.py")
} else {
    Write-Host "[3/5] Branding icons verified." -ForegroundColor Green
}

# 4. Ensure Mozaik Theme is compiled
$ThemeFile = Join-Path $ScriptDir "theme\mozaik.attheme"
if (-not (Test-Path $ThemeFile)) {
    Write-Host "[4/6] Compiling Mozaik theme (.attheme)..." -ForegroundColor Cyan
    python (Join-Path $ScriptDir "scripts\build_mozaik_theme.py")
} else {
    Write-Host "[4/6] Mozaik theme verified." -ForegroundColor Green
}

# 5. Ensure Release Keystore exists
$KeystorePath = Join-Path $ScriptDir "signing\kipsway.keystore"
if (-not (Test-Path $KeystorePath)) {
    Write-Host "[5/6] Generating release keystore (kipsway.keystore)..." -ForegroundColor Cyan
    keytool -genkeypair -v -keystore $KeystorePath -alias kipsway -keyalg RSA -keysize 2048 -validity 10000 -storepass kgram2026 -keypass kgram2026 -dname "CN=kipsway, OU=kGram, O=kipsway, C=RU"
} else {
    Write-Host "[5/6] Release keystore verified: $KeystorePath" -ForegroundColor Green
}

# 6. Apply Branding, Theme & Package Isolation
Write-Host "[6/6] Applying package isolation (org.kipsway.kgram), strings and Mozaik hook..." -ForegroundColor Cyan
python (Join-Path $ScriptDir "scripts\apply_kgram_branding.py") $RepoPath

Write-Host "`n>>> SUCCESS: kGram готов к сборке! <<<" -ForegroundColor Green
Write-Host "Пакет приложения: org.kipsway.kgram" -ForegroundColor White
Write-Host "Дефолтная тема: Мозаика (#0A0A0C, #B8A7F0)" -ForegroundColor White
Write-Host "Подпись: kipsway.keystore" -ForegroundColor White
Write-Host "Базовые меню: Настройки kGram, Цвета Мозаика, k-Tunnel, Музыкальный плеер" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
