# 🛠️ Сборка и Релиз kGram (by kipsway)

В данном документе описан полный цикл сборки, подписи и публикации релизного APK **kGram** (`org.kipsway.kgram`).

---

## 📋 Требования к окружению
- **ОС:** Windows 10/11, macOS или Linux (Ubuntu 22.04+)
- **JDK:** OpenJDK 17 или 21 (Temurin)
- **Android SDK:** Platform 36, Build-Tools 36.0.0
- **Android NDK:** `26.3.11579264` (строго зафиксировано в NimarkoGram)
- **CMake:** `3.22.1`
- **Python:** `3.11` (для среды Chaquopy и скрипта брендинга)
- **Git:** с поддержкой LFS и сабмодулей

---

## ⚡ Локальная подготовка и сборка

### 1. Автоматическая конфигурация (Шаг 1–4)
В корне проекта запустите скрипт настройки:

**Для Windows (PowerShell):**
```powershell
cd kgram
.\setup_kgram.ps1
```

**Для Linux / macOS / Git Bash:**
```bash
cd kgram
chmod +x setup_kgram.sh
./setup_kgram.sh
```

Скрипт автоматически:
- Изолирует пакет в `org.kipsway.kgram` и аккаунты в `org.kipsway.kgram.account`.
- Скомпилирует и встроит тему «Мозаика» (`mozaik.attheme`, 209 ключей).
- Установит компоненты полноэкранного плеера **RX Playa** (`RxPlayaPlayerView`).
- Внедрит нативный экран **«Настройки kGram»** (`KGramSettingsFragment`).
- Сгенерирует адаптивные сквиркл-иконки во всех плотностях `mipmap-*`.
- Настроит параметры подписи релиза через `signing/kipsway.keystore`.

### 2. Запуск сборки релизного APK
Перейдите в корень склонированного репозитория и выполните:

```bash
./gradlew :TMessagesProj_AppStandalone:assembleAfatStandalone --no-daemon
```

Готовый подписанный APK будет сгенерирован по пути:
`TMessagesProj_AppStandalone/build/outputs/apk/afat/standalone/app.apk`

---

## 🚀 Автоматическая сборка в GitHub Actions (CI/CD)

В репозиторий добавлен файл рабочего процесса:
[kgram/.github/workflows/build_kgram.yml](file:///C:/Users/ДДД/Desktop/s/kgram/.github/workflows/build_kgram.yml)

### 1. Настройка секретов репозитория (GitHub Secrets)
В настройках вашего репозитория GitHub (*Settings → Secrets and variables → Actions*):
- Добавьте секрет **`KEYSTORE_BASE64`**:
  Сгенерируйте значение локально:
  ```bash
  python kgram/scripts/export_keystore_secret.py
  ```
  И скопируйте выведенную строку в поле секрета.

### 2. Публикация нового релиза
Для создания официального релиза с публикацией APK в GitHub Releases и формированием манифеста для **kStore**:
```bash
git tag v10.9.1
git push origin v10.9.1
```

GitHub Actions автоматически:
1. Развернет окружение JDK 21, Android NDK 26.3 и Python 3.11.
2. Восстановит ключ подписи `kipsway.keystore`.
3. Применит все патчи и тему «Мозаика».
4. Соберет оптимизированный `kGram-v10.9.1-arm.apk`.
5. Посчитает контрольную сумму SHA-256.
6. Сгенерирует файл манифеста обновления `kstore_manifest.json`.
7. Создаст релиз на GitHub с готовыми ссылками для каталога **kStore**.
