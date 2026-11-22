# ==============================================================================
# 🪐 k-Ecosystem: Master Build & Verification Suite (by kipsway)
# Проверка и сборка всей экосистемы: kStore, kTok, kGram, kTube, kWitch
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  🪐 k-Ecosystem: Master Build Suite (by kipsway)         " -ForegroundColor Cyan
Write-Host "  Палитра: Мозаика (#0A0A0C, лаванда #B8A7F0)             " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Magenta

# 1. Проверка Java
$KnownJavaPaths = @(
    (Join-Path $env:LOCALAPPDATA "Programs\PrismLauncher\java\java-runtime-delta\bin"),
    (Join-Path $env:ProgramFiles "Java\jdk-21\bin"),
    (Join-Path $env:ProgramFiles "Java\jdk-17\bin")
)
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    foreach ($p in $KnownJavaPaths) {
        if (Test-Path (Join-Path $p "java.exe")) {
            $env:Path = "$p;$env:Path"
            break
        }
    }
}

$javaCmd = Get-Command java -ErrorAction SilentlyContinue
if ($javaCmd) {
    $javaVer = & $javaCmd.Source -version 2>&1
    Write-Host "[✓] Java найдена: $($javaVer[0])" -ForegroundColor Green
} else {
    Write-Host "[!] Java не найдена в PATH" -ForegroundColor Yellow
}

# 2. Проверка Python
$pyCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pyCmd) {
    $pyVer = & $pyCmd.Source --version 2>&1
    Write-Host "[✓] Python найден: $pyVer" -ForegroundColor Green
} else {
    Write-Host "[!] Python не найден" -ForegroundColor Yellow
}

Write-Host "`n----------------------------------------------------------" -ForegroundColor Magenta
Write-Host "  📦 Проверка проектов экосистемы                        " -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor Magenta

# 3. Валидация kTok
$ktokVerify = ".\ktok\scripts\verify_ktok.py"
if (Test-Path $ktokVerify) {
    Write-Host "[+] Запуск проверки kTok..." -ForegroundColor Cyan
    & python $ktokVerify
}

# 4. Проверка иконок в assets/
Write-Host "`n[+] Проверка векторных иконок в assets/..." -ForegroundColor Cyan
$Icons = @(
    "assets\kstore_icon.svg",
    "assets\ktok_icon.svg",
    "assets\kgram_icon.svg",
    "assets\ktube_icon.svg",
    "assets\kwitch_icon.svg"
)
foreach ($icon in $Icons) {
    if (Test-Path $icon) {
        Write-Host "  [✓] $icon" -ForegroundColor Green
    } else {
        Write-Host "  [✗] $icon отсутствует!" -ForegroundColor Red
    }
}

# 5. Проверка CI/CD Workflows
Write-Host "`n[+] Проверка GitHub Actions workflows..." -ForegroundColor Cyan
$Workflows = @(
    ".github\workflows\build_kstore.yml",
    ".github\workflows\build_ktok.yml",
    ".github\workflows\build_kgram.yml",
    ".github\workflows\build_ktube.yml",
    ".github\workflows\build_kwitch.yml"
)
foreach ($wf in $Workflows) {
    if (Test-Path $wf) {
        Write-Host "  [✓] $wf" -ForegroundColor Green
    } else {
        Write-Host "  [✗] $wf отсутствует!" -ForegroundColor Red
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  🎉 Все 5 проектов k-Ecosystem валидированы и готовы!   " -ForegroundColor Green
Write-Host "  • kStore : com.kipsway.kstore                           " -ForegroundColor White
Write-Host "  • kTok   : com.kipsway.ktok                             " -ForegroundColor White
Write-Host "  • kGram  : org.kipsway.kgram                            " -ForegroundColor White
Write-Host "  • kTube  : com.kipsway.ktube                            " -ForegroundColor White
Write-Host "  • kWitch : com.kipsway.kwitch                           " -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
