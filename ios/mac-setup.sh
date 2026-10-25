#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p ios/www/icons
cp index.html styles.css app.js manifest.webmanifest ios/www/
cp icons/*.png icons/*.svg ios/www/icons/

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
