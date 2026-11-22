#!/usr/bin/env bash
# ==============================================================================
# kTok (TikTok Mod by kipsway) — Скрипт сборки для Linux / macOS / WSL
# Палитра: Мозаика (#0A0A0C, лаванда #B8A7F0)
# ==============================================================================

set -euo pipefail

INPUT_APK="${1:-tiktok_stock.apk}"
OUTPUT_APK="${2:-../out/kTok-by_kipsway.apk}"
KEYSTORE_PATH="${3:-../keystore/kipsway.keystore}"
KEYSTORE_PASS="${4:-kipsway123}"
KEY_ALIAS="${5:-kipsway}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TOOLS_DIR="$ROOT_DIR/tools"
BUILD_DIR="$ROOT_DIR/build"
OUT_DIR="$ROOT_DIR/out"
PATCHES_DIR="$ROOT_DIR/patches"
RES_DIR="$ROOT_DIR/res"
SRC_DIR="$ROOT_DIR/src"

mkdir -p "$TOOLS_DIR" "$BUILD_DIR" "$OUT_DIR"

echo -e "\033[1;35m==========================================================\033[0m"
echo -e "\033[1;36m  🎵 Сборка kTok (TikTok by kipsway) [Палитра Мозаика]     \033[0m"
echo -e "\033[1;35m==========================================================\033[0m"

# 1. Проверка Java
if ! command -v java &> /dev/null; then
    echo -e "\033[1;31m[!] Java (JDK 17+) не найдена! Установите OpenJDK 17+.\033[0m"
    exit 1
fi

# 2. Проверка исходного APK
if [ ! -f "$INPUT_APK" ]; then
    echo -e "\033[1;33m[!] Исходный файл $INPUT_APK не найден.\033[0m"
    echo "Поместите чистый APK TikTok в корень проекта или передайте путь аргументом."
    exit 1
fi

# 3. Загрузка инструментов
CLI_JAR="$TOOLS_DIR/revanced-cli.jar"
PATCHES_JAR="$TOOLS_DIR/revanced-patches.jar"
APKTOOL_JAR="$TOOLS_DIR/apktool.jar"
UBER_SIGNER="$TOOLS_DIR/uber-apk-signer.jar"

ensure_tool() {
    local url="$1"
    local dest="$2"
    if [ ! -f "$dest" ]; then
        echo -e "\033[1;33m[↓] Загрузка $(basename "$dest")...\033[0m"
        curl -sSL "$url" -o "$dest"
    fi
}

ensure_tool "https://github.com/revanced/revanced-cli/releases/download/v4.6.0/revanced-cli-4.6.0-all.jar" "$CLI_JAR"
ensure_tool "https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_2.9.3.jar" "$APKTOOL_JAR"
ensure_tool "https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar" "$UBER_SIGNER"

# 4. Проверка или создание Keystore
if [ ! -f "$KEYSTORE_PATH" ]; then
    mkdir -p "$(dirname "$KEYSTORE_PATH")"
    echo -e "\033[1;33m[!] Keystore не найден. Создаем ключ разработчика...\033[0m"
    keytool -genkey -v -keystore "$KEYSTORE_PATH" -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
        -storepass "$KEYSTORE_PASS" -keypass "$KEYSTORE_PASS" -dname "CN=kipsway, OU=kTok, O=kipsway, C=RU"
fi

# 5. Декомпиляция и внедрение ресурсов
DECOMPILE_DIR="$BUILD_DIR/decompiled"
rm -rf "$DECOMPILE_DIR"

echo -e "\033[1;36m[+] Шаг 1: Декомпиляция ресурсов через Apktool...\033[0m"
java -jar "$APKTOOL_JAR" d -f -r "$INPUT_APK" -o "$DECOMPILE_DIR"

echo -e "\033[1;36m[+] Шаг 2: Внедрение брендинга kTok, цветов и иконок...\033[0m"
cp -rf "$RES_DIR/"* "$DECOMPILE_DIR/res/"

find "$DECOMPILE_DIR/res" -name "strings.xml" -exec sed -i -e 's|<string name="app_name">.*</string>|<string name="app_name">kTok</string>|g' {} +

# Внедрение smali хуков
SMALI_DEST="$DECOMPILE_DIR/smali_classes_ktok/com/kipsway/ktok"
mkdir -p "$SMALI_DEST"
cp -f "$PATCHES_DIR/smali/"*.smali "$SMALI_DEST/"

# Модификация манифеста: смена пакета и регистрация KTokSettingsActivity
MANIFEST_FILE="$DECOMPILE_DIR/AndroidManifest.xml"
if [ -f "$MANIFEST_FILE" ]; then
    sed -i -E 's|package="com\.zhiliaoapp\.musically[^"]*"|package="com.kipsway.ktok"|g' "$MANIFEST_FILE"
    sed -i -E 's|com\.zhiliaoapp\.musically\.fileprovider|com.kipsway.ktok.fileprovider|g' "$MANIFEST_FILE"
    sed -i -E 's|</application>|<activity android:name="com.kipsway.ktok.KTokSettingsActivity" android:exported="false" android:theme="@android:style/Theme.NoTitleBar" /></application>|g' "$MANIFEST_FILE"
fi

echo -e "\033[1;36m[+] Шаг 3: Пересборка ресурсов...\033[0m"
RES_MOD_APK="$BUILD_DIR/tiktok_res_mod.apk"
java -jar "$APKTOOL_JAR" b "$DECOMPILE_DIR" -o "$RES_MOD_APK"

# 6. Патчинг ReVanced CLI
PATCHED_UNSIGNED="$BUILD_DIR/ktok_patched_unsigned.apk"
if [ -f "$PATCHES_JAR" ]; then
    echo -e "\033[1;36m[+] Шаг 4: Применение Smali/Dex патчей kTok...\033[0m"
    java -jar "$CLI_JAR" patch \
        --patches "$PATCHES_JAR" \
        --options "$PATCHES_DIR/patches.json" \
        --enable "ktok-package-rename" \
        --enable "ktok-clean-download" \
        --enable "ktok-region-spoof" \
        --enable "ktok-ad-blocker" \
        --out "$PATCHED_UNSIGNED" \
        "$RES_MOD_APK"
else
    echo -e "\033[1;33m[!] revanced-patches.jar отсутствует, используется модифицированный по ресурсам APK.\033[0m"
    cp "$RES_MOD_APK" "$PATCHED_UNSIGNED"
fi

# 7. Подпись и финализация
echo -e "\033[1;36m[+] Шаг 5: Выравнивание и подпись ключом kipsway...\033[0m"
java -jar "$UBER_SIGNER" \
    --apks "$PATCHED_UNSIGNED" \
    --ks "$KEYSTORE_PATH" \
    --ksPass "$KEYSTORE_PASS" \
    --ksAlias "$KEY_ALIAS" \
    --ksKeyPass "$KEYSTORE_PASS" \
    --out "$OUT_DIR" \
    --overwrite

SIGNED_APK="$OUT_DIR/ktok_patched_unsigned-aligned-signed.apk"
FINAL_APK="$OUT_DIR/kTok-by_kipsway.apk"

if [ -f "$SIGNED_APK" ]; then
    mv -f "$SIGNED_APK" "$FINAL_APK"
fi

echo -e "\033[1;32m==========================================================\033[0m"
echo -e "\033[1;32m  🎉 Сборка kTok завершена: $FINAL_APK                    \033[0m"
echo -e "\033[1;32m==========================================================\033[0m"
