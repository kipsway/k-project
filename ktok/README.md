# 🎵 kTok — TikTok Mod by kipsway

> **Архитектура:** ReVanced CLI + Собственный движок `patcher_engine.py` + Smali-хуки + Палитра «Мозаика»  
> **Имя пакета:** `com.kipsway.ktok` (параллельная установка с оригинальным TikTok)  
> **Фирменные цвета:** Оникс `#0A0A0C`, панели `#0F0F12`, лаванда `#B8A7F0`, активная рамка `#7E6FC4`

---

## ⚡ Функционал
1. **Скачивание без водяного знака:** Прямой перехват `play_addr` вместо `download_addr`. Видео сохраняется в высоком качестве в `Movies/kTok` через MediaStore API (Android 10 - 15+).
2. **Скачивание аудио:** Экспорт трека ролика в `.mp3` в системную папку `Music/kTok`.
3. **Смена региона (Region Spoofing):** Спуфинг SIM/Network ISO (США, Германия, Нидерланды, Япония, Казахстан и др.) без извлечения SIM-карты.
4. **Вырезание рекламы:** Полное удаление спонсированных роликов и рекламных карточек в ленте `For You`.
5. **Человеческие названия меню:** «Настройки kTok», «Скачать без знака», «Сменить регион», «Скрыть рекламу в ленте».
6. **Быстрое меню действий (`KTokActionDialog`):** Вызов по долгому тапу на видео для мгновенного скачивания или смены региона.

---

## 📁 Структура проекта
```text
ktok/
├── src/com/kipsway/ktok/
│   ├── KTokDownloader.java       # MediaStore Scoped Storage загрузчик (Movies/kTok, Music/kTok)
│   ├── KTokRegionDialog.java     # Сквиркл-диалог выбора страны («Сменить регион»)
│   ├── KTokSettingsActivity.java # Полный экран «Настройки kTok» в палитре «Мозаика»
│   └── KTokActionDialog.java     # Быстрое меню действий ролика по долгому тапу
├── patches/
│   ├── patches.json              # Конфиг ReVanced CLI
│   ├── manifest/
│   │   └── package_rules.json    # Правила подмены пакета и изоляции провайдеров
│   └── smali/
│       └── KTokHook.smali        # Точки перехвата байткода
├── res/
│   ├── values/colors.xml         # Цветовая палитра «Мозаика»
│   ├── values-ru/strings.xml     # Локализация и русские названия
│   └── drawable/ic_launcher_*    # Адаптивная иконка в сквиркле
├── scripts/
│   ├── patcher_engine.py         # Движок автоматического патчинга Smali и Manifest
│   ├── build_ktok.ps1            # Скрипт сборки под Windows (PowerShell)
│   └── build_ktok.sh             # Скрипт сборки под Linux/WSL (Bash)
└── .github/workflows/
    └── build_ktok.yml            # CI/CD сборка и публикация в GitHub Releases (для kStore)
```

---

## 🛠 Сборка APK
```powershell
cd ktok/scripts
.\build_ktok.ps1 -InputApk "..\tiktok_stock.apk"
```
Готовый подписанный APK сохраняется в `ktok/out/kTok-by_kipsway.apk`.
