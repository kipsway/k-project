#!/usr/bin/env python3
# ==============================================================================
# kTok Smali & Manifest Patcher Engine (by kipsway)
# Автоматический движок инжекции хуков, смены пакета и патчинга байткода TikTok
# ==============================================================================

import os
import re
import sys
import shutil

class KTokPatcher:
    def __init__(self, decompile_dir: str):
        self.decompile_dir = os.path.abspath(decompile_dir)
        self.stats = {
            "region_hooks": 0,
            "ad_hooks": 0,
            "watermark_hooks": 0,
            "manifest_patched": False,
            "providers_isolated": 0
        }

    def run(self):
        print("\033[1;36m[+] Запуск движка патчинга kTok...\033[0m")
        if not os.path.exists(self.decompile_dir):
            print(f"\033[1;31m[!] Каталог декомпиляции не найден: {self.decompile_dir}\033[0m")
            return False

        self.patch_manifest()
        self.patch_smali_tree()
        self.print_summary()
        return True

    def patch_manifest(self):
        manifest_path = os.path.join(self.decompile_dir, "AndroidManifest.xml")
        if not os.path.exists(manifest_path):
            print(f"[!] AndroidManifest.xml не найден в {manifest_path}")
            return

        with open(manifest_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 1. Подмена имени пакета
        content = re.sub(
            r'package="com\.(?:zhiliaoapp\.musically|ss\.android\.ugc\.trill)[^"]*"',
            'package="com.kipsway.ktok"',
            content
        )

        # 2. Изоляция провайдеров для параллельной установки
        authorities = [
            ("com.zhiliaoapp.musically.fileprovider", "com.kipsway.ktok.fileprovider"),
            ("com.zhiliaoapp.musically.push", "com.kipsway.ktok.push"),
            ("com.ss.android.ugc.trill.fileprovider", "com.kipsway.ktok.fileprovider")
        ]
        for src, dst in authorities:
            if src in content:
                content = content.replace(src, dst)
                self.stats["providers_isolated"] += 1

        # 3. Регистрация KTokSettingsActivity
        activity_tag = '<activity android:name="com.kipsway.ktok.KTokSettingsActivity" android:exported="false" android:theme="@android:style/Theme.NoTitleBar" />'
        if "com.kipsway.ktok.KTokSettingsActivity" not in content:
            content = content.replace("</application>", f"    {activity_tag}\n</application>")

        # 4. Принудительное имя приложения
        content = re.sub(r'android:label="[^"]*"', 'android:label="@string/app_name"', content)

        with open(manifest_path, "w", encoding="utf-8") as f:
            f.write(content)

        self.stats["manifest_patched"] = True
        print("  \033[1;32m[✓] AndroidManifest.xml: пакет com.kipsway.ktok и активность зарегистрированы\033[0m")

    def patch_smali_tree(self):
        smali_dirs = [
            os.path.join(self.decompile_dir, d)
            for d in os.listdir(self.decompile_dir)
            if d.startswith("smali") and os.path.isdir(os.path.join(self.decompile_dir, d))
        ]

        print(f"  [+] Сканирование smali-каталогов ({len(smali_dirs)} папок)...")

        for smali_dir in smali_dirs:
            for root, _, files in os.walk(smali_dir):
                for file in files:
                    if file.endswith(".smali"):
                        file_path = os.path.join(root, file)
                        self.patch_smali_file(file_path)

    def patch_smali_file(self, file_path: str):
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception:
            return

        modified = False

        # 1. Хук обхода региона (TelephonyManager.getSimCountryIso & getNetworkCountryIso)
        if "getSimCountryIso" in content or "getNetworkCountryIso" in content:
            new_content = re.sub(
                r'invoke-virtual\s+\{([vp]\d+)\},\s+Landroid/telephony/TelephonyManager;->get(?:Sim|Network)CountryIso\(\)Ljava/lang/String;',
                r'invoke-static {\1, \1}, Lcom/kipsway/ktok/KTokHook;->getRegion(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;',
                content
            )
            if new_content != content:
                content = new_content
                modified = True
                self.stats["region_hooks"] += 1

        # 2. Хук вырезания рекламы (Aweme.isAd)
        if ".method public isAd()Z" in content:
            new_content = re.sub(
                r'(\.method public isAd\(\)Z[\s\S]*?)(return [vp]\d+)',
                r'\1const/4 \2, 0x0\n    return \2',
                content
            )
            if new_content != content:
                content = new_content
                modified = True
                self.stats["ad_hooks"] += 1

        # 3. Хук скачивания чистого видео (подмена download_addr на play_addr)
        if "download_addr" in content and "play_addr" in content:
            new_content = re.sub(
                r'invoke-virtual\s+\{([vp]\d+)\},\s+Lcom/ss/android/ugc/aweme/feed/model/Video;->getDownloadAddr\(\)Lcom/ss/android/ugc/aweme/base/model/UrlModel;',
                r'invoke-virtual {\1}, Lcom/ss/android/ugc/aweme/feed/model/Video;->getPlayAddr()Lcom/ss/android/ugc/aweme/base/model/UrlModel;',
                content
            )
            if new_content != content:
                content = new_content
                modified = True
                self.stats["watermark_hooks"] += 1

        if modified:
            try:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(content)
            except Exception:
                pass

    def print_summary(self):
        print("\033[1;35m----------------------------------------------------------\033[0m")
        print("\033[1;32m  🎉 Патчинг байткода kTok успешно завершен!             \033[0m")
        print(f"  • Манифест и пакет: {'Изолирован' if self.stats['manifest_patched'] else 'Пропущен'}")
        print(f"  • Изолировано провайдеров: {self.stats['providers_isolated']}")
        print(f"  • Внедрено хуков смены региона: {self.stats['region_hooks']}")
        print(f"  • Внедрено хуков фильтрации рекламы: {self.stats['ad_hooks']}")
        print(f"  • Внедрено хуков скачивания без знака: {self.stats['watermark_hooks']}")
        print("\033[1;35m----------------------------------------------------------\033[0m")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Использование: python patcher_engine.py <путь_к_декомпилированному_apk>")
        sys.exit(1)

    target_dir = sys.argv[1]
    patcher = KTokPatcher(target_dir)
    success = patcher.run()
    sys.exit(0 if success else 1)
