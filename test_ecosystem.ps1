# ==============================================================================
# k-Ecosystem Automated Sanity & Validation Test Suite (by kipsway)
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  🧪 k-Ecosystem Sanity & Integrity Test Suite" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Magenta

$passed = 0
$failed = 0

function Assert-Test([string]$name, [scriptblock]$condition) {
    try {
        $result = & $condition
        if ($result) {
            Write-Host "  [PASS] $name" -ForegroundColor Green
            $script:passed++
        } else {
            Write-Host "  [FAIL] $name" -ForegroundColor Red
            $script:failed++
        }
    } catch {
        Write-Host "  [FAIL] $name - Исключение: $_" -ForegroundColor Red
        $script:failed++
    }
}

# 1. Проверка Keystore
Write-Host "`n1. Валидация криптографической подписи:" -ForegroundColor Yellow
$masterKs = Join-Path $RootDir "ktube\build\kipsway.keystore"
Assert-Test "Мастер-хранилище kipsway.keystore существует" { Test-Path $masterKs }
Assert-Test "Keystore содержит alias 'kipsway'" {
    $out = (keytool -list -keystore $masterKs -storepass "kipsway2026" 2>&1 | Out-String)
    $out -match "kipsway"
}

# 2. Проверка JSON-манифестов
Write-Host "`n2. Валидация JSON-конфигураций:" -ForegroundColor Yellow
$jsonFiles = @(
    (Join-Path $RootDir "ECOSYSTEM_MANIFEST.json"),
    (Join-Path $RootDir "ktube\patches\config.json"),
    (Join-Path $RootDir "ktube\k-tunnel\config\tunnel_config.json"),
    (Join-Path $RootDir "ktok\patches\patches.json")
)

foreach ($jf in $jsonFiles) {
    $leaf = Split-Path -Leaf $jf
    Assert-Test "Синтаксис JSON валиден: $leaf" {
        $content = Get-Content $jf -Raw -Encoding UTF8
        $null -ne ($content | ConvertFrom-Json)
    }
}

# 3. Проверка идентификаторов пакетов
Write-Host "`n3. Валидация пакетов приложений (com.kipsway.*):" -ForegroundColor Yellow
$manifestObj = Get-Content (Join-Path $RootDir "ECOSYSTEM_MANIFEST.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$expectedPackages = @("com.kipsway.kstore", "com.kipsway.ktube", "com.kipsway.kwitch", "com.kipsway.kgram", "com.kipsway.ktok")

foreach ($pkg in $expectedPackages) {
    Assert-Test "Пакет зарегистрирован в манифесте: $pkg" {
        $found = $manifestObj.Applications | Where-Object { $_.Package -eq $pkg }
        $null -ne $found
    }
}

# 4. Проверка ассетов и иконок
Write-Host "`n4. Валидация ассетов каталога kStore:" -ForegroundColor Yellow
$storeIcons = @("ktube_icon.png", "ktok_icon.png", "kgram_icon.png", "kwitch_icon.png")
foreach ($icon in $storeIcons) {
    $iconPath = Join-Path $RootDir "kstore\assets\$icon"
    Assert-Test "Иконка мода найдена: $icon" { Test-Path $iconPath }
}

# 5. Проверка ключевой палитры «Мозаика»
Write-Host "`n5. Проверка соответствия палитры (#0A0A0C Оникс, #B8A7F0 Лаванда):" -ForegroundColor Yellow
$themeColorsFile = Join-Path $RootDir "ktube\patches\theme\res\values\colors.xml"
Assert-Test "ktube colors.xml содержит чистый оникс #0A0A0C" {
    $c = Get-Content $themeColorsFile -Raw
    $c -match "#0A0A0C" -and $c -match "#B8A7F0"
}

$flutterColors = Join-Path $RootDir "kstore\lib\theme\colors.dart"
Assert-Test "kstore colors.dart содержит KColors.bg = 0xFF0A0A0C" {
    $fc = Get-Content $flutterColors -Raw
    $fc -match "0xFF0A0A0C" -and $fc -match "0xFFB8A7F0"
}

# 6. Проверка сетевого ядра k-Tunnel
Write-Host "`n6. Валидация сетевого ядра k-Tunnel:" -ForegroundColor Yellow
$routerJava = Join-Path $RootDir "ktube\k-tunnel\hooks\NetworkTrafficRouter.java"
Assert-Test "Маршрутизатор трафика перехватывает googlevideo.com" {
    $rc = Get-Content $routerJava -Raw
    $rc -match "googlevideo\.com" -and $rc -match "videoplayback"
}

Write-Host "`n==========================================================" -ForegroundColor Magenta
Write-Host "  Результаты тестирования: $passed пройдено, $failed провалено" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==========================================================" -ForegroundColor Magenta

if ($failed -gt 0) {
    exit 1
}
