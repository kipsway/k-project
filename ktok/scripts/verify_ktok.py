#!/usr/bin/env python3
# ==============================================================================
# kTok Verification & Test Suite (by kipsway)
# Комплексный тест целостности файлов, байткод-патчера и палитры «Мозаика»
# ==============================================================================

import os
import sys
import tempfile
import shutil

# Пути к проекту kTok
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
KTOK_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)

from patcher_engine import KTokPatcher

def test_project_structure():
    print("\033[1;36m[+] Тест 1: Проверка наличия всех ключевых файлов kTok...\033[0m")
    required_files = [
        "README.md",
        "patches/patches.json",
        "patches/manifest/package_rules.json",
        "patches/smali/KTokHook.smali",
        "src/com/kipsway/ktok/KTokDownloader.java",
        "src/com/kipsway/ktok/KTokRegionDialog.java",
        "src/com/kipsway/ktok/KTokSettingsActivity.java",
        "src/com/kipsway/ktok/KTokActionDialog.java",
        "res/values/colors.xml",
        "res/values-ru/strings.xml",
        "assets/ktok_icon.svg",
        "scripts/patcher_engine.py",
        "scripts/build_ktok.ps1",
        "scripts/build_ktok.sh",
        ".github/workflows/build_ktok.yml"
    ]

    missing = []
    for rel_path in required_files:
        full_path = os.path.join(KTOK_DIR, rel_path)
        if not os.path.exists(full_path):
            missing.append(rel_path)

    if missing:
        print(f"  \033[1;31m[✗] Отсутствуют файлы: {missing}\033[0m")
        return False
    print("  \033[1;32m[✓] Все 15 ключевых файлов на месте.\033[0m")
    return True

def test_mozaik_palette_and_strings():
    print("\033[1;36m[+] Тест 2: Проверка соответствия палитре «Мозаика» и человеческим названиям...\033[0m")
    colors_file = os.path.join(KTOK_DIR, "res/values/colors.xml")
    strings_file = os.path.join(KTOK_DIR, "res/values-ru/strings.xml")

    with open(colors_file, "r", encoding="utf-8") as f:
        colors_content = f.read()

    assert "#0A0A0C" in colors_content, "Цвет фона #0A0A0C не найден"
    assert "#B8A7F0" in colors_content, "Цвет лаванды #B8A7F0 не найден"
    assert "#7E6FC4" in colors_content, "Цвет активной рамки #7E6FC4 не найден"
    print("  \033[1;32m[✓] Палитра «Мозаика» валидна (#0A0A0C, #B8A7F0, #7E6FC4).\033[0m")

    with open(strings_file, "r", encoding="utf-8") as f:
        strings_content = f.read()

    assert "kTok" in strings_content
    assert "Настройки kTok" in strings_content
    assert "Сменить регион" in strings_content
    assert "Скачать без знака" in strings_content
    assert "Скрыть рекламу в ленте" in strings_content
    print("  \033[1;32m[✓] Строковые ресурсы содержат понятный человеческий русский язык.\033[0m")
    return True

def test_patcher_engine_simulation():
    print("\033[1;36m[+] Тест 3: Симуляция работы patcher_engine.py на тестовом APK...\033[0m")
    test_dir = tempfile.mkdtemp(prefix="ktok_test_")

    try:
        # Создаем тестовый AndroidManifest.xml
        mock_manifest = '''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.zhiliaoapp.musically">
    <application android:label="TikTok">
        <provider android:name="androidx.core.content.FileProvider"
            android:authorities="com.zhiliaoapp.musically.fileprovider" />
        <provider android:name="com.ss.android.push"
            android:authorities="com.zhiliaoapp.musically.push" />
    </application>
</manifest>'''
        with open(os.path.join(test_dir, "AndroidManifest.xml"), "w", encoding="utf-8") as f:
            f.write(mock_manifest)

        # Создаем тестовые smali файлы
        smali_dir = os.path.join(test_dir, "smali/com/ss/android/ugc/aweme")
        os.makedirs(smali_dir, exist_ok=True)

        mock_smali = '''.class public Lcom/ss/android/ugc/aweme/Aweme;
.super Ljava/lang/Object;

.method public getSim()V
    .registers 2
    invoke-virtual {v0}, Landroid/telephony/TelephonyManager;->getSimCountryIso()Ljava/lang/String;
    return-void
.end method

.method public isAd()Z
    .registers 2
    const/4 v0, 0x1
    return v0
.end method

.method public download()V
    .registers 2
    invoke-virtual {v0}, Lcom/ss/android/ugc/aweme/feed/model/Video;->getDownloadAddr()Lcom/ss/android/ugc/aweme/base/model/UrlModel;
    return-void
.end method
'''
        with open(os.path.join(smali_dir, "Aweme.smali"), "w", encoding="utf-8") as f:
            f.write(mock_smali)

        # Запускаем патчер
        patcher = KTokPatcher(test_dir)
        success = patcher.run()

        assert success, "Патчер завершился с ошибкой"

        # Проверяем результат манифеста
        with open(os.path.join(test_dir, "AndroidManifest.xml"), "r", encoding="utf-8") as f:
            res_manifest = f.read()

        assert 'package="com.kipsway.ktok"' in res_manifest, "Пакет не заменен"
        assert 'com.kipsway.ktok.fileprovider' in res_manifest, "FileProvider не изолирован"
        assert 'com.kipsway.ktok.KTokSettingsActivity' in res_manifest, "Активность не зарегистрирована"
        assert 'android:label="@string/app_name"' in res_manifest, "Label не обновлен"

        # Проверяем результат smali
        with open(os.path.join(smali_dir, "Aweme.smali"), "r", encoding="utf-8") as f:
            res_smali = f.read()

        assert 'Lcom/kipsway/ktok/KTokHook;->getRegion' in res_smali, "Хук региона не внедрен"
        assert 'const/4 v0, 0x0' in res_smali, "Хук рекламы не внедрен"
        assert 'getPlayAddr()Lcom/ss/android/ugc/aweme/base/model/UrlModel;' in res_smali, "Хук чистой ссылки не внедрен"

        print("  \033[1;32m[✓] Все хуки и изоляция манифеста в patcher_engine отработали безупречно.\033[0m")
        return True

    finally:
        shutil.rmtree(test_dir, ignore_errors=True)

if __name__ == "__main__":
    print("\033[1;35m==========================================================\033[0m")
    print("\033[1;35m  🧪 Комплексная валидация сборщика kTok (by kipsway)     \033[0m")
    print("\033[1;35m==========================================================\033[0m")

    t1 = test_project_structure()
    t2 = test_mozaik_palette_and_strings()
    t3 = test_patcher_engine_simulation()

    if t1 and t2 and t3:
        print("\033[1;32m\n  🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО! kTok готов к релизу!      \033[0m")
        sys.exit(0)
    else:
        print("\033[1;31m\n  [!] Некоторые тесты провалены!                         \033[0m")
        sys.exit(1)
