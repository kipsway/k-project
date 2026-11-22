#!/usr/bin/env python3
"""
kGram Branding & Package Isolator (by kipsway)
Applies package ID change, isolation, strings, and icon assets to NimarkoGram codebase.
"""

import os
import re
import shutil
import sys

def patch_file(file_path, replacements):
    if not os.path.exists(file_path):
        print(f"[WARN] File not found: {file_path}")
        return False

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    new_content = content
    for pattern, replacement in replacements:
        new_content = re.sub(pattern, replacement, new_content)

    if new_content != content:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"[OK] Patched: {os.path.basename(file_path)}")
        return True
    else:
        print(f"[SKIP] No changes needed: {os.path.basename(file_path)}")
        return False

def apply_branding(repo_root):
    print(f"=== Applying kGram Branding to: {repo_root} ===")

    # 1. TMessagesProj_AppStandalone/build.gradle
    app_standalone_gradle = os.path.join(repo_root, "TMessagesProj_AppStandalone", "build.gradle")
    patch_file(app_standalone_gradle, [
        (r"defaultConfig\.applicationId\s*=\s*['\"]app\.nimarkogram\.messenger['\"]",
         "defaultConfig.applicationId = 'org.kipsway.kgram'"),
        (r"defaultConfig\.applicationId\s*=\s*APP_PACKAGE",
         "defaultConfig.applicationId = 'org.kipsway.kgram'"),
    ])

    # 2. TMessagesProj/src/main/res/xml/sync_contacts.xml
    sync_contacts = os.path.join(repo_root, "TMessagesProj", "src", "main", "res", "xml", "sync_contacts.xml")
    patch_file(sync_contacts, [
        (r'android:accountType="org\.telegram\.messenger"',
         'android:accountType="org.kipsway.kgram.account"'),
        (r'android:accountType="app\.nimarkogram\.messenger"',
         'android:accountType="org.kipsway.kgram.account"'),
    ])

    # 3. TMessagesProj/src/main/res/values/strings.xml
    strings_en = os.path.join(repo_root, "TMessagesProj", "src", "main", "res", "values", "strings.xml")
    patch_file(strings_en, [
        (r'<string name="AppName">.*?</string>', '<string name="AppName">kGram</string>'),
        (r'<string name="AppNameBeta">.*?</string>', '<string name="AppNameBeta">kGram Beta</string>'),
        (r'<string name="NimarkoGramSettings">.*?</string>', '<string name="NimarkoGramSettings">kGram Settings</string>'),
        (r'<string name="NM_WSB_Title">.*?</string>', '<string name="NM_WSB_Title">k-Tunnel</string>'),
        (r'<string name="NM_WSB_Enable">.*?</string>', '<string name="NM_WSB_Enable">Enable k-Tunnel</string>'),
        (r'<string name="NM_WSBypassBuiltIn">.*?</string>', '<string name="NM_WSBypassBuiltIn">**k-Tunnel** acceleration is built into the client</string>'),
    ])

    # Inject kGram custom string tokens into English strings.xml if not present
    if os.path.exists(strings_en):
        with open(strings_en, "r", encoding="utf-8") as f:
            data = f.read()
        if "kgram_author_branding" not in data:
            custom_tokens = """
    <!-- kGram (by kipsway) extensions -->
    <string name="kgram_author_branding">by kipsway</string>
    <string name="kgram_settings_title">kGram Settings</string>
    <string name="kgram_theme_mosaic">Colors Mosaic</string>
    <string name="kgram_player_rxplaya">Music Player</string>
    <string name="kgram_ghost_mode">Ghost Mode</string>
    <string name="kgram_ktunnel_accel">k-Tunnel Acceleration</string>
</resources>"""
            data = data.replace("</resources>", custom_tokens)
            with open(strings_en, "w", encoding="utf-8") as f:
                f.write(data)
            print("[OK] Injected kGram tokens into strings.xml (EN)")

    # 4. TMessagesProj/src/main/res/values-ru/strings.xml
    strings_ru = os.path.join(repo_root, "TMessagesProj", "src", "main", "res", "values-ru", "strings.xml")
    patch_file(strings_ru, [
        (r'<string name="AppName">.*?</string>', '<string name="AppName">kGram</string>'),
        (r'<string name="AppNameBeta">.*?</string>', '<string name="AppNameBeta">kGram Beta</string>'),
        (r'<string name="NimarkoGramSettings">.*?</string>', '<string name="NimarkoGramSettings">Настройки kGram</string>'),
        (r'<string name="Preferences">Настройки exteraGram</string>', '<string name="Preferences">Настройки kGram</string>'),
        (r'<string name="Preferences">Настройки NimarkoGram</string>', '<string name="Preferences">Настройки kGram</string>'),
        (r'<string name="NM_WSB_Title">.*?</string>', '<string name="NM_WSB_Title">k-Tunnel</string>'),
        (r'<string name="NM_WSB_Enable">.*?</string>', '<string name="NM_WSB_Enable">Ускорение k-Tunnel</string>'),
        (r'<string name="NM_WSB_About">.*?</string>', '<string name="NM_WSB_About">Автоматический туннель для обхода блокировок и ускорения связи.</string>'),
        (r'<string name="NM_WSBypassBuiltIn">.*?</string>', '<string name="NM_WSBypassBuiltIn">**Ускорение k-Tunnel** уже встроено в клиент</string>'),
        (r'NimarkoGram', 'kGram'),
    ])

    # Inject kGram custom string tokens into Russian strings.xml
    if os.path.exists(strings_ru):
        with open(strings_ru, "r", encoding="utf-8") as f:
            data = f.read()
        if "kgram_author_branding" not in data:
            custom_tokens_ru = """
    <!-- kGram (by kipsway) extensions -->
    <string name="kgram_author_branding">by kipsway</string>
    <string name="kgram_settings_title">Настройки kGram</string>
    <string name="kgram_theme_mosaic">Цвета Мозаика</string>
    <string name="kgram_player_rxplaya">Музыкальный плеер</string>
    <string name="kgram_ghost_mode">Призрачный режим</string>
    <string name="kgram_ktunnel_accel">Ускорение k-Tunnel</string>
</resources>"""
            data = data.replace("</resources>", custom_tokens_ru)
            with open(strings_ru, "w", encoding="utf-8") as f:
                f.write(data)
            print("[OK] Injected kGram tokens into strings.xml (RU)")

    # 5. Copy Icons from kgram/assets to target res/mipmap-*
    script_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.abspath(os.path.join(script_dir, "..", "assets"))
    densities = ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"]

    res_dir = os.path.join(repo_root, "TMessagesProj", "src", "main", "res")
    if os.path.exists(res_dir):
        for density in densities:
            src_folder = os.path.join(assets_dir, density)
            dst_folder = os.path.join(res_dir, density)
            if os.path.exists(src_folder) and os.path.exists(dst_folder):
                for icon_file in ["ic_launcher.png", "ic_launcher_sa.png", "ic_launcher_round.png", "ic_launcher_sa_round.png"]:
                    src_f = os.path.join(src_folder, icon_file)
                    dst_f = os.path.join(dst_folder, icon_file)
                    if os.path.exists(src_f):
                        shutil.copy2(src_f, dst_f)
                print(f"[OK] Replaced icons in {density}")

    # 6. Configure signing in private.properties
    signing_keystore = os.path.abspath(os.path.join(script_dir, "..", "signing", "kipsway.keystore"))
    private_props_path = os.path.join(repo_root, "private.properties")
    signing_config_text = f"""
# kGram Release Signing Config (by kipsway)
RELEASE_STORE_FILE={signing_keystore.replace('\\', '/')}
RELEASE_STORE_PASSWORD=kgram2026
RELEASE_KEY_ALIAS=kipsway
RELEASE_KEY_PASSWORD=kgram2026
"""
    with open(private_props_path, "a", encoding="utf-8") as f:
        f.write(signing_config_text)
    print(f"[OK] Configured private.properties with kipsway.keystore")

    print("=== kGram Branding Applied Successfully! ===")

if __name__ == "__main__":
    target_repo = sys.argv[1] if len(sys.argv) > 1 else "."
    apply_branding(os.path.abspath(target_repo))
