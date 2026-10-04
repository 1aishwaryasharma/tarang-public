#!/usr/bin/env bash
set -euo pipefail

tarang_root="$(cd "$(dirname "$0")/.." && pwd)"
tarang_key="$tarang_root/.local/tarang-signing.keystore"
cd "$tarang_root"

bun expo prebuild --platform android --no-install

# Expo's generated release variant uses this keystore. Keep its identity stable
# across clean prebuilds so Android can install later APKs as updates.
if [[ -f "$tarang_key" ]]; then
  cp "$tarang_key" android/app/debug.keystore
else
  mkdir -p "$tarang_root/.local"
  cp android/app/debug.keystore "$tarang_key"
  chmod 600 "$tarang_key"
fi

cd android
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
./gradlew assembleRelease

echo "APK: $tarang_root/android/app/build/outputs/apk/release/app-release.apk"
