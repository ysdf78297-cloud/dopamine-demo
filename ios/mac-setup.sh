#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p ios/Dopamine/www/icons ios/Sileo/www ios/Zebra/www
cp index.html styles.css app.js manifest.webmanifest ios/Dopamine/www/
cp icons/*.png icons/*.svg ios/Dopamine/www/icons/
cp sileo/index.html sileo/styles.css sileo/app.js sileo/icon-180.png sileo/icon-192.png ios/Sileo/www/
cp zebra/index.html zebra/styles.css zebra/app.js zebra/icon-180.png zebra/icon-192.png ios/Zebra/www/

cd ios

if ! command -v xcodegen >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install xcodegen
  else
    echo "Downloading XcodeGen..."
    curl -fsSL -o /tmp/xcodegen.zip https://github.com/yonaskolb/XcodeGen/releases/latest/download/xcodegen.zip
    rm -rf /tmp/xcodegen
    mkdir -p /tmp/xcodegen
    unzip -q /tmp/xcodegen.zip -d /tmp/xcodegen
    export PATH="/tmp/xcodegen/xcodegen/bin:$PATH"
  fi
fi

xcodegen generate
open Dopamine.xcodeproj

echo ""
echo "Done. In Xcode:"
echo "  1. Xcode > Settings > Accounts > add your Apple ID"
echo "  2. Select the Dopamine target > Signing & Capabilities > choose your Team"
echo "  3. Plug in the iPhone, pick it at the top, press Run"
