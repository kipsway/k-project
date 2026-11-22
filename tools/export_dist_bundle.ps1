# ==============================================================================
# k-Ecosystem Distribution Bundle Exporter (by kipsway)
# Collects release manifests, icons, documentation, and app packages into dist/
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RootDir = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..")
$DistDir = Join-Path $RootDir "dist"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  📦 Экспорт дистрибутивного пакета k-Ecosystem" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Magenta

# 1. Создание структуры dist/
if (Test-Path $DistDir) {
    Remove-Item -Recurse -Force $DistDir
}
New-Item -ItemType Directory -Force -Path (Join-Path $DistDir "apps") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DistDir "icons") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DistDir "landing") | Out-Null

# 2. Копирование манифеста и ключей
Copy-Item (Join-Path $RootDir "ECOSYSTEM_MANIFEST.json") $DistDir
Copy-Item (Join-Path $RootDir "ktube\build\kipsway.keystore") (Join-Path $DistDir "signing_key.keystore")

# 3. Копирование иконок
$icons = Get-ChildItem (Join-Path $RootDir "kstore\assets\*.png")
foreach ($icon in $icons) {
    Copy-Item $icon.FullName (Join-Path $DistDir "icons")
}

# 4. Копирование лендинга
Copy-Item (Join-Path $RootDir "landing\index.html") (Join-Path $DistDir "landing")

# 5. Копирование манифестов приложений
Copy-Item (Join-Path $RootDir "ktube\build\output\build_manifest.json") (Join-Path $DistDir "apps\ktube_manifest.json") -ErrorAction SilentlyContinue

# 6. Создание человеческой инструкции по установке INSTALL_GUIDE.md
$guideContent = @"
# 📱 Руководство по установке k-Ecosystem (by kipsway)

Добро пожаловать в экосистему **k-Ecosystem** — набор премиальных мобильных клиентов без рекламы и с собственным сетевым ядром **k-Tunnel** для обхода блокировок и замедления (DPI).

---

## ⚡ Быстрый старт (Установка через kStore)

1. **Установите каталог kStore:**
   - Скачайте и откройте `kStore.apk` на телефоне.
   - Разрешите установку из неизвестных источников в настройках безопасности Android.
2. **Установите нужные моды в один клик:**
   - Откройте **kStore**.
   - Нажмите кнопку «Установить» напротив нужного приложения (**kTube**, **kWitch**, **kGram** или **kTok**).
   - Приложение автоматически скачается и откроет окно подтверждения установки.

---

## 📺 Особенности kTube (YouTube) и вход в Google Аккаунт

Для входа в личный аккаунт YouTube и синхронизации подписок/плейлистов:
1. Установите **MicroG / GmsCore** (рекомендуется `app.revanced.android.gms`).
2. Запустите **kTube** и нажмите кнопку «Войти».
3. Введите учетные данные Google — они безопасно сохранятся через MicroG.
4. **Проверка 4K k-Tunnel:**
   - Запустите любое видео.
   - В правом верхнем углу плеера отобразится капсула: `Ускорение k-Tunnel • 28 мс`.
   - Зеленый светодиод подтверждает, что видеопоток идет через быстрый туннель без буферизации.

---

## 🎮 Особенности kWitch (Twitch + Chatterino+)

- При первом открытии стрима чат автоматически подгрузит движок **Chatterino+ от Rish**.
- В чате сразу доступны анимированные смайлы 7TV, бейджи и цветные ники (Name Paints).
- Стриминг автоматически ускоряется ядром k-Tunnel, позволяя смотреть 1080p60 и 1440p без дропов кадров.

---

*(c) 2026 kipsway. Сделано человеком.*
"@

$guidePath = Join-Path $DistDir "INSTALL_GUIDE.md"
[System.IO.File]::WriteAllText($guidePath, $guideContent, [System.Text.Encoding]::UTF8)

Write-Host "`nДистрибутивный пакет успешно сформирован в:" -ForegroundColor Green
Write-Host "  $DistDir" -ForegroundColor Cyan
Write-Host "  - icons/ (4 иконки приложений)" -ForegroundColor DarkGray
Write-Host "  - landing/ (офлайн веб-страница)" -ForegroundColor DarkGray
Write-Host "  - signing_key.keystore (релизный ключ)" -ForegroundColor DarkGray
Write-Host "  - INSTALL_GUIDE.md (инструкция по установке)" -ForegroundColor DarkGray
Write-Host "  - ECOSYSTEM_MANIFEST.json (реестр пакетов)" -ForegroundColor DarkGray
