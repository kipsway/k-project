#!/usr/bin/env bash
# ==============================================================================
# kGram (Telegram Fork by kipsway) — Скрипт конфигурации пакета (Linux / macOS)
# Базовый клиент: NimarkoGram (Telegram 13.2.2)
# Целевой пакет: org.kipsway.kgram
# ==============================================================================

set -euo pipefail

SOURCE_DIR="${1:-../../kgram_upstream}"
NEW_PACKAGE="${2:-org.kipsway.kgram}"
APP_NAME="${3:-kGram}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
RES_DIR="$ROOT_DIR/res"

echo -e "\033[1;35m==========================================================\033[0m"
echo -e "\033[1;36m  💬 Настройка пакета kGram (by kipsway)                   \033[0m"
echo -e "\033[1;36m  Целевой пакет: $NEW_PACKAGE                               \033[0m"
echo -e "\033[1;35m==========================================================\033[0m"

BUILD_GRADLE="$SOURCE_DIR/TMessagesProj/build.gradle"
MANIFEST_XML="$SOURCE_DIR/TMessagesProj/src/main/AndroidManifest.xml"

# 1. Замена applicationId в build.gradle
if [ -f "$BUILD_GRADLE" ]; then
    echo -e "\033[1;36m[+] Шаг 1: Обновление applicationId в build.gradle...\033[0m"
    sed -i -E "s/applicationId \".*\"/applicationId \"$NEW_PACKAGE\"/g" "$BUILD_GRADLE"
    sed -i -E "s/APP_PACKAGE_NAME = \".*\"/APP_PACKAGE_NAME = \"$NEW_PACKAGE\"/g" "$BUILD_GRADLE"
    echo -e "\033[1;32m[✓] build.gradle обновлен.\033[0m"
fi

# 2. Изоляция ContentProvider в AndroidManifest.xml
if [ -f "$MANIFEST_XML" ]; then
    echo -e "\033[1;36m[+] Шаг 2: Изоляция ContentProvider в AndroidManifest.xml...\033[0m"
    sed -i -E "s/package=\"org\.telegram\.messenger[^\"]*\"/package=\"$NEW_PACKAGE\"/g" "$MANIFEST_XML"
    sed -i -E "s/org\.telegram\.messenger\.provider/$NEW_PACKAGE.provider/g" "$MANIFEST_XML"
    sed -i -E "s/org\.telegram\.messenger\.notification_image_provider/$NEW_PACKAGE.notification_image_provider/g" "$MANIFEST_XML"
    sed -i -E "s/org\.telegram\.messenger\.call_file_provider/$NEW_PACKAGE.call_file_provider/g" "$MANIFEST_XML"
    sed -i -E "s/org\.telegram\.messenger\.web_file_provider/$NEW_PACKAGE.web_file_provider/g" "$MANIFEST_XML"
    sed -i -E "s/org\.telegram\.messenger\.fileprovider/$NEW_PACKAGE.fileprovider/g" "$MANIFEST_XML"
    sed -i -E "s/org\.telegram\.messenger\.permission\.MAPS_RECEIVE/$NEW_PACKAGE.permission.MAPS_RECEIVE/g" "$MANIFEST_XML"
    echo -e "\033[1;32m[✓] AndroidManifest.xml изолирован от официального клиента.\033[0m"
fi

# 3. Внедрение ресурсов
TARGET_RES_DIR="$SOURCE_DIR/TMessagesProj/src/main/res"
if [ -d "$TARGET_RES_DIR" ]; then
    echo -e "\033[1;36m[+] Шаг 3: Внедрение русскоязычной локализации и названия $APP_NAME...\033[0m"
    cp -rf "$RES_DIR/"* "$TARGET_RES_DIR/"
    echo -e "\033[1;32m[✓] Ресурсы kGram скопированы в дерево исходников.\033[0m"
fi

echo -e "\033[1;32m==========================================================\033[0m"
echo -e "\033[1;32m  🎉 Конфигурация $APP_NAME ($NEW_PACKAGE) завершена!   \033[0m"
echo -e "\033[1;32m==========================================================\033[0m"
