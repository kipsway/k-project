# 🎵 kTok — TikTok Mod by kipsway

> **Архитектура:** ReVanced CLI + Smali/Dex патчи MargyT + Палитра «Мозаика»  
> **Имя пакета:** `com.kipsway.ktok` (параллельная установка с оригиналом)  
> **Фирменные цвета:** Оникс `#0A0A0C`, панели `#0F0F12`, лаванда `#B8A7F0`, активная рамка `#7E6FC4`

---

## ⚡ Функционал
1. **Скачивание без водяного знака:** Прямой перехват `play_addr` вместо замусоренного `download_addr`.
2. **Скачивание аудио:** Экспорт трека ролика в `.mp3`/`.aac` в системную папку `Music/kTok`.
3. **Смена региона:** Подмена `TelephonyManager.getSimCountryIso()` без необходимости извлекать SIM-карту.
4. **Вырезание рекламы:** Полная фильтрация спонсированных роликов в ленте `For You`.
5. **Человеческие названия:** Простые пункты настроек («Настройки kTok», «Скачать без знака», «Сменить регион»).

---

## 📁 Структура проекта
```text
ktok/
├── patches/
│   ├── patches.json            # Конфиг активных патчей ReVanced
│   └── smali/
│       └── KTokHook.smali      # Байткод-хуки региона, фильтра рекламы и чистых ссылок
├── res/
│   ├── values/
│   │   ├── colors.xml          # Цветовая палитра «Мозаика»
│   │   └── strings.xml         # Локализация и русские названия пунктов
│   ├── values-ru/
│   │   └── strings.xml         # Русскоязычные строковые ресурсы
│   ├── drawable/
│   │   ├── ic_launcher_background.xml
│   │   └── ic_launcher_foreground.xml
│   └── mipmap-anydpi-v26/
│       ├── ic_launcher.xml     # Адаптивная иконка в сквиркле
│       └── ic_launcher_round.xml
├── scripts/
│   ├── build_ktok.ps1          # Скрипт сборки под Windows (PowerShell)
│   └── build_ktok.sh           # Скрипт сборки под Linux/WSL (Bash)
├── assets/
│   └── ktok_icon.svg           # Превью векторной иконки для kStore
└── .github/workflows/
    └── build_ktok.yml          # Облачный CI/CD пайплайн GitHub Actions
```

---

## 🛠 Локальная сборка
### Windows (PowerShell):
```powershell
cd ktok/scripts
.\build_ktok.ps1 -InputApk "..\tiktok_stock.apk"
```

### Linux / WSL:
```bash
cd ktok/scripts
chmod +x build_ktok.sh
./build_ktok.sh "../tiktok_stock.apk"
```
Готовый подписанный APK будет сохранен в `ktok/out/kTok-by_kipsway.apk`.
