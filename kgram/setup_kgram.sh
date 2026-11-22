#!/usr/bin/env bash
# ==============================================================================
# kGram Setup & Configuration Script (Bash / Linux / macOS / CI)
# Author: kipsway
# Project: kGram (Telegram Fork based on Ettacent/NimarkoGram)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_PATH="${1:-$PARENT_DIR/kgram_upstream}"

echo "=========================================================="
echo "         kGram Configuration & Branding Tool              "
echo "                    by kipsway                            "
echo "=========================================================="

echo "[1/5] Target repository directory: $REPO_PATH"

# 2. Check / Clone Upstream if needed
if [ ! -d "$REPO_PATH/.git" ]; then
    echo "[2/5] Upstream repository not found. Cloning Ettacent/NimarkoGram..."
    git -c http.proxy="" -c https.proxy="" clone --filter=blob:none --depth 1 https://github.com/Ettacent/NimarkoGram.git "$REPO_PATH"
else
    echo "[2/5] Existing Git repository verified at $REPO_PATH."
fi

# 3. Ensure Branding Icons are Generated
ASSETS_DIR="$SCRIPT_DIR/assets"
ICON_512="$ASSETS_DIR/kgram_icon_512.png"
if [ ! -f "$ICON_512" ]; then
    echo "[3/5] Generating kGram 'Мозаика' branding icons..."
    python3 "$SCRIPT_DIR/scripts/generate_icons.py" || python "$SCRIPT_DIR/scripts/generate_icons.py"
else
    echo "[3/5] Branding icons verified."
fi

# 4. Ensure Release Keystore exists
KEYSTORE_PATH="$SCRIPT_DIR/signing/kipsway.keystore"
if [ ! -f "$KEYSTORE_PATH" ]; then
    echo "[4/5] Generating release keystore (kipsway.keystore)..."
    keytool -genkeypair -v -keystore "$KEYSTORE_PATH" \
        -alias kipsway \
        -keyalg RSA \
        -keysize 2048 \
        -validity 10000 \
        -storepass kgram2026 \
        -keypass kgram2026 \
        -dname "CN=kipsway, OU=kGram, O=kipsway, C=RU"
else
    echo "[4/5] Release keystore verified: $KEYSTORE_PATH"
fi

# 5. Apply Branding and Package Isolation
echo "[5/5] Applying package isolation (org.kipsway.kgram) and strings..."
python3 "$SCRIPT_DIR/scripts/apply_kgram_branding.py" "$REPO_PATH" || python "$SCRIPT_DIR/scripts/apply_kgram_branding.py" "$REPO_PATH"

echo ""
echo ">>> SUCCESS: kGram Шаг 1 завершен успешно! <<<"
echo "Пакет приложения: org.kipsway.kgram"
echo "Подпись: kipsway.keystore"
echo "Базовые меню: Настройки kGram, Цвета Мозаика, k-Tunnel, Музыкальный плеер"
echo "=========================================================="
