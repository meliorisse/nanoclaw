#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT/dist/AntigravitySystemEventsBridge.app"
SRC="$ROOT/src/main.applescript"
PLIST_PATH="$APP_DIR/Contents/Info.plist"

rm -rf "$APP_DIR"
mkdir -p "$ROOT/dist"

osacompile -o "$APP_DIR" "$SRC"

set_plist_value() {
  local key="$1"
  local type="$2"
  local value="$3"

  /usr/libexec/PlistBuddy -c "Delete :$key" "$PLIST_PATH" >/dev/null 2>&1 || true
  /usr/libexec/PlistBuddy -c "Add :$key $type $value" "$PLIST_PATH"
}

set_plist_value "CFBundleIdentifier" "string" "com.nanoclaw.antigravitybridge"
set_plist_value "CFBundleName" "string" "AntigravitySystemEventsBridge"
set_plist_value "CFBundleShortVersionString" "string" "1.0"
set_plist_value "CFBundleVersion" "string" "1"
set_plist_value "LSUIElement" "bool" "true"
set_plist_value "NSAppleEventsUsageDescription" "string" "AntigravitySystemEventsBridge needs Automation access to System Events so NanoClaw can safely send messages inside the unitybox Antigravity session."

if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true
fi

echo "Built $APP_DIR"
