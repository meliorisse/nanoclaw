#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT/dist/AntigravityCollector.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"
BIN_PATH="$MACOS_DIR/antigravity-collector"
PLIST_PATH="$APP_DIR/Contents/Info.plist"

mkdir -p "$MACOS_DIR"

cat > "$PLIST_PATH" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>antigravity-collector</string>
  <key>CFBundleIdentifier</key>
  <string>com.nanoclaw.antigravitycollector</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>AntigravityCollector</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
EOF

swiftc \
  "$ROOT/src/main.swift" \
  -o "$BIN_PATH" \
  -framework AppKit \
  -framework ApplicationServices \
  -framework ScreenCaptureKit \
  -framework Vision

chmod +x "$BIN_PATH"

if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true
fi

echo "Built $APP_DIR"
