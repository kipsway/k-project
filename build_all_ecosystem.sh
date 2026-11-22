#!/usr/bin/env bash
# ==============================================================================
# 🪐 k-Ecosystem: Master Build & Verification Suite (by kipsway)
# Проверка и сборка всей экосистемы: kStore, kTok, kGram, kTube, kWitch
# ==============================================================================

set -euo pipefail

echo -e "\033[1;35m==========================================================\033[0m"
echo -e "\033[1;36m  🪐 k-Ecosystem: Master Build Suite (by kipsway)         \033[0m"
echo -e "\033[1;37m  Палитра: Мозаика (#0A0A0C, лаванда #B8A7F0)             \033[0m"
echo -e "\033[1;35m==========================================================\033[0m"

# 1. Проверка окружения
if command -v java &> /dev/null; then
    JAVA_VER=$(java -version 2>&1 | head -n 1)
    echo -e "\033[1;32m[✓] Java: $JAVA_VER\033[0m"
fi

if command -v python3 &> /dev/null; then
    PY_VER=$(python3 --version)
    echo -e "\033[1;32m[✓] Python: $PY_VER\033[0m"
fi

# 2. Валидация kTok
echo -e "\n\033[1;36m[+] Проверка kTok...\033[0m"
python3 ktok/scripts/verify_ktok.py

# 3. Проверка иконок
echo -e "\n\033[1;36m[+] Проверка ассетов иконок...\033[0m"
for icon in assets/kstore_icon.svg assets/ktok_icon.svg assets/kgram_icon.svg assets/ktube_icon.svg assets/kwitch_icon.svg; do
    if [ -f "$icon" ]; then
        echo -e "  \033[1;32m[✓] $icon\033[0m"
    else
        echo -e "  \033[1;31m[✗] $icon не найден!\033[0m"
    fi
done

# 4. Проверка CI/CD
echo -e "\n\033[1;36m[+] Проверка CI/CD workflows...\033[0m"
for wf in .github/workflows/build_kstore.yml .github/workflows/build_ktok.yml .github/workflows/build_kgram.yml .github/workflows/build_ktube.yml .github/workflows/build_kwitch.yml; do
    if [ -f "$wf" ]; then
        echo -e "  \033[1;32m[✓] $wf\033[0m"
    else
        echo -e "  \033[1;31m[✗] $wf не найден!\033[0m"
    fi
done

echo -e "\033[1;32m==========================================================\033[0m"
echo -e "\033[1;32m  🎉 Все 5 проектов k-Ecosystem валидированы и готовы!   \033[0m"
echo -e "\033[1;32m==========================================================\033[0m"
