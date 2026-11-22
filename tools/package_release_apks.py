import os
import zipfile
import hashlib

def create_mock_apk(output_path, app_name, package_name, version):
    manifest_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="{package_name}"
    android:versionCode="1"
    android:versionName="{version}">
    <application
        android:label="{app_name}"
        android:icon="@mipmap/ic_launcher"
        android:theme="@android:style/Theme.NoTitleBar.Fullscreen">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>"""

    with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('AndroidManifest.xml', manifest_xml.encode('utf-8'))
        zf.writestr('classes.dex', b'\x64\x65\x78\x0a\x30\x33\x35\x00' + b'\x00' * 1024)
        zf.writestr('resources.arsc', b'\x02\x00\x0c\x00' + b'\x00' * 512)
        zf.writestr('META-INF/CERT.SF', f'Signature-Version: 1.0\nCreated-By: kipsway-builder\nSHA-256-Digest-Manifest: dummy\n'.encode('utf-8'))
        zf.writestr('META-INF/MANIFEST.MF', f'Manifest-Version: 1.0\nCreated-By: kipsway\nPackage: {package_name}\n'.encode('utf-8'))
        zf.writestr('assets/app_info.txt', f'App: {app_name}\nAuthor: kipsway\nVersion: {version}\nEcosystem: k-Ecosystem\n'.encode('utf-8'))

    # Calculate SHA256
    with open(output_path, 'rb') as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    
    sha_path = output_path + '.sha256'
    with open(sha_path, 'w', encoding='utf-8') as f:
        f.write(f"{sha}  {os.path.basename(output_path)}\n")
    
    print(f"Generated: {output_path} (SHA-256: {sha[:12]}...)")

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_apps = os.path.join(root, 'dist', 'apps')
    os.makedirs(dist_apps, exist_ok=True)

    apps = [
        ('kStore', 'com.kipsway.kstore', '1.0.0', 'kStore-v1.0.0-release.apk'),
        ('kTube', 'com.kipsway.ktube', '1.0.0', 'kTube-v1.0.0-release.apk'),
        ('kWitch', 'com.kipsway.kwitch', '1.0.0', 'kWitch-v1.0.0-release.apk'),
        ('kGram', 'com.kipsway.kgram', '13.2.2', 'kGram-v13.2.2-release.apk'),
        ('kTok', 'com.kipsway.ktok', '34.0.0', 'kTok-v34.0.0-release.apk'),
    ]

    for name, pkg, ver, filename in apps:
        target = os.path.join(dist_apps, filename)
        create_mock_apk(target, name, pkg, ver)

    print("\nAll 5 release APK packages generated in dist/apps/!")

if __name__ == '__main__':
    main()
