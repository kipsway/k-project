# 💬 kGram — Telegram Fork by kipsway

> **Архитектура:** База NimarkoGram (Telegram 13.2.2) + Палитра «Мозаика» + Плеер RX Playa + Сеть k-Tunnel  
> **Имя пакета:** `org.kipsway.kgram` (параллельная установка с официальным клиентом)  
> **Фирменные цвета:** Оникс `#0A0A0C`, панели `#0F0F12`, лаванда `#B8A7F0`, активная рамка `#7E6FC4`

---

## ⚡ Ключевой функционал
1. **Тема «Мозаика» по умолчанию:** Глубокий оникс `#0A0A0C` без серых засветов и лаванда `#B8A7F0` из дизайн-системы Chatterino+ (chat.eblo.id).
2. **Аудиоплеер RX Playa:** Полноэкранный плеер с крупной обложкой 280dp со сквирклом 28dp, мягким нижним виньетированием, тактильными капсулами M3 и жестовой навигацией.
3. **Сетевое ускорение k-Tunnel:** Встроенная автоматическая настройка прокси-туннеля для стабильной связи без блокировок.
4. **Инструменты приватности:** Призрачный режим (Ghost mode), скрытие индикатора набора текста («печатает...»), сохранение удаленных сообщений.
5. **Медиа-инструменты:** Запись HD-видеокружочков CameraX без потери битрейта.
6. **Человеческие настройки:** Меню «Настройки kGram» (подзаголовок: *by kipsway*) с понятными описаниями на русском языке.

---

## 📁 Структура проекта
```text
kgram/
├── .github/workflows/
│   └── build_kgram.yml             # Полный CI/CD пайплайн сборки и релиза в GitHub Actions
├── setup_kgram.ps1                 # Главный скрипт автоматической настройки (PowerShell)
├── setup_kgram.sh                  # Главный скрипт автоматической настройки (Bash / CI)
├── kstore_manifest.json            # Манифест приложения для каталога kStore
├── docs/
│   └── BUILD_AND_RELEASE.md        # Руководство по локальной сборке и настройке секретов CI
├── theme/
│   ├── mozaik.attheme              # Полная тема Telegram (209 ключей палитры Chatterino+)
│   └── MozaikThemeManager.java     # Менеджер авто-применения темы при первом старте
├── player/
│   ├── RxPlayaPlayerView.java      # Экран плеера музыки в стиле RX Playa со свайпами
│   └── RxPlayaHelper.java          # Мост связки с MediaController ядра Telegram
├── settings/
│   ├── KGramConfig.java            # Единое SharedPreferences-хранилище параметров
│   └── KGramSettingsFragment.java  # Нативный фрагмент «Настройки kGram»
├── res/
│   ├── values/strings.xml          # Англоязычные fallback-строки
│   └── values-ru/strings.xml       # Русская человечная локализация
├── signing/
│   ├── kipsway.keystore            # Релизный ключ подписи (RSA 2048, 10 000 дней)
│   └── signing.properties          # Параметры подписи для Gradle
├── assets/
│   ├── kgram_icon_512.png          # Маркет-иконка kGram 512x512
│   └── mipmap-*/                   # Сгенерированные сквиркл-иконки для всех плотностей
├── scripts/
│   ├── apply_kgram_branding.py     # Кроссплатформенный движок патчинга и интеграции
│   ├── build_mozaik_theme.py       # Компилятор цветов темы из CSS в .attheme
│   ├── generate_icons.py           # Генератор адаптивных иконок
│   └── export_keystore_secret.py   # Экспорт ключа в Base64 для GitHub Secrets
└── patches/
    ├── 0001-kgram-branding-and-isolation.patch # Патч изоляции пакета
    ├── 0002-kgram-mozaik-theme-integration.patch # Патч хука темы
    ├── 0003-kgram-rxplaya-player.patch         # Патч плеера RX Playa
    └── 0004-kgram-settings-integration.patch    # Патч перехода в настройки
```

---

## 🚀 Быстрый старт сборки

### Локальная настройка:
```powershell
cd kgram
.\setup_kgram.ps1
```

### Сборка релизного APK:
```bash
./gradlew :TMessagesProj_AppStandalone:assembleAfatStandalone
```
Подписанный релизный APK будет готов в:
`TMessagesProj_AppStandalone/build/outputs/apk/afat/standalone/app.apk`
