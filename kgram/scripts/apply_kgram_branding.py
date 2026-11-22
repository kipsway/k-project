#!/usr/bin/env python3
"""
kGram Branding, Package Isolator & Theme Installer (by kipsway)
Applies package ID change, isolation, strings, icon assets, and Mozaik default theme.
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
    print(f"=== Applying kGram Branding & Mozaik Theme to: {repo_root} ===")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    kgram_dir = os.path.abspath(os.path.join(script_dir, ".."))

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
    assets_dir = os.path.join(kgram_dir, "assets")
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

    # 6. Deploy Mozaik Theme Asset & Code Hook
    mozaik_src = os.path.join(kgram_dir, "theme", "mozaik.attheme")
    assets_themes_dir = os.path.join(repo_root, "TMessagesProj", "src", "main", "assets", "themes")
    os.makedirs(assets_themes_dir, exist_ok=True)
    if os.path.exists(mozaik_src):
        shutil.copy2(mozaik_src, os.path.join(assets_themes_dir, "mozaik.attheme"))
        print("[OK] Bundled mozaik.attheme into assets/themes/")

    # Deploy MozaikThemeManager.java
    theme_java_src = os.path.join(kgram_dir, "theme", "MozaikThemeManager.java")
    theme_java_dst_dir = os.path.join(repo_root, "TMessagesProj", "src", "main", "java", "org", "kipsway", "kgram", "theme")
    os.makedirs(theme_java_dst_dir, exist_ok=True)
    if os.path.exists(theme_java_src):
        shutil.copy2(theme_java_src, os.path.join(theme_java_dst_dir, "MozaikThemeManager.java"))
        print("[OK] Installed MozaikThemeManager.java into source tree")

    # Hook into LaunchActivity.java onCreate
    launch_activity_path = os.path.join(repo_root, "TMessagesProj", "src", "main", "java", "org", "telegram", "ui", "LaunchActivity.java")
    if os.path.exists(launch_activity_path):
        patch_file(launch_activity_path, [
            (r"(Theme\.createDialogsResources\(this\);)(?!\s*org\.kipsway\.kgram)",
             r"\1\n        org.kipsway.kgram.theme.MozaikThemeManager.checkAndApplyDefaultTheme(this);")
        ])

    # 7. Deploy RX Playa Player & Settings components
    player_src_dir = os.path.join(kgram_dir, "player")
    player_dst_dir = os.path.join(repo_root, "TMessagesProj", "src", "main", "java", "org", "kipsway", "kgram", "player")
    os.makedirs(player_dst_dir, exist_ok=True)
    if os.path.exists(player_src_dir):
        for f in os.listdir(player_src_dir):
            if f.endswith(".java"):
                shutil.copy2(os.path.join(player_src_dir, f), os.path.join(player_dst_dir, f))
        print("[OK] Installed RX Playa player components into source tree")

    settings_src_dir = os.path.join(kgram_dir, "settings")
    settings_dst_dir = os.path.join(repo_root, "TMessagesProj", "src", "main", "java", "org", "kipsway", "kgram", "settings")
    os.makedirs(settings_dst_dir, exist_ok=True)
    if os.path.exists(settings_src_dir):
        for f in os.listdir(settings_src_dir):
            if f.endswith(".java"):
                shutil.copy2(os.path.join(settings_src_dir, f), os.path.join(settings_dst_dir, f))
        print("[OK] Installed kGram settings components into source tree")

    network_src_dir = os.path.join(kgram_dir, "network")
    network_dst_dir = os.path.join(repo_root, "TMessagesProj", "src", "main", "java", "org", "kipsway", "kgram", "network")
    os.makedirs(network_dst_dir, exist_ok=True)
    if os.path.exists(network_src_dir):
        for f in os.listdir(network_src_dir):
            if f.endswith(".java"):
                shutil.copy2(os.path.join(network_src_dir, f), os.path.join(network_dst_dir, f))
        print("[OK] Installed k-Tunnel network components into source tree")

    # Hook into AudioPlayerAlert.java
    audio_alert_path = os.path.join(repo_root, "TMessagesProj", "src", "main", "java", "org", "telegram", "ui", "Components", "AudioPlayerAlert.java")
    if os.path.exists(audio_alert_path):
        patch_file(audio_alert_path, [
            (r"(playerLayout\.addView\(coverContainer,\s*LayoutHelper\.createFrame\(44,\s*44,\s*Gravity\.TOP\s*\|\s*Gravity\.RIGHT,\s*0,\s*20,\s*20,\s*0\)\);)",
             r"if (org.kipsway.kgram.player.RxPlayaHelper.isEnabled(context)) {\n            org.kipsway.kgram.player.RxPlayaHelper.attachPlayer(context, playerLayout);\n        } else {\n            \1\n        }")
        ])

    # Hook into SettingsActivity.java (Item 900 -> KGramSettingsFragment)
    settings_activity_path = os.path.join(repo_root, "TMessagesProj", "src", "main", "java", "org", "telegram", "ui", "SettingsActivity.java")
    if os.path.exists(settings_activity_path):
        patch_file(settings_activity_path, [
            (r"case 900:\s*presentFragment\(new app\.nimarkogram\.messenger\.preferences\.MainPreferencesActivity\(\)\);",
             r"case 900:\n                presentFragment(new org.kipsway.kgram.settings.KGramSettingsFragment());")
        ])

    # 8. Configure signing in private.properties
    signing_keystore = os.path.join(kgram_dir, "signing", "kipsway.keystore")
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

    print("=== kGram Branding, Mozaik Theme & RX Playa Player Applied Successfully! ===")

if __name__ == "__main__":
    target_repo = sys.argv[1] if len(sys.argv) > 1 else "."
    apply_branding(os.path.abspath(target_repo))
