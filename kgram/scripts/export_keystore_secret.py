#!/usr/bin/env python3
"""
Helper to export kipsway.keystore as a Base64 string for GitHub Secrets (KEYSTORE_BASE64).
"""

import base64
import os

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    keystore_path = os.path.join(script_dir, "..", "signing", "kipsway.keystore")

    if not os.path.exists(keystore_path):
        print(f"Error: Keystore not found at {keystore_path}")
        return

    with open(keystore_path, "rb") as f:
        data = f.read()

    b64_str = base64.b64encode(data).decode("utf-8")
    print("=== GitHub Secret: KEYSTORE_BASE64 ===")
    print(b64_str)
    print("=======================================")

if __name__ == "__main__":
    main()
