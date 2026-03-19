#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/dist/AntigravityCollector.app"
LOG_DIR="/Users/unitybox/nanoclaw/runtime/antigravity-collector"
STDOUT_LOG="$LOG_DIR/stdout.log"
STDERR_LOG="$LOG_DIR/stderr.log"

mkdir -p "$LOG_DIR"

TMP_DIR="$(mktemp -d "$LOG_DIR/run.XXXXXX")"
OUT_FILE="$TMP_DIR/stdout.txt"
ERR_FILE="$TMP_DIR/stderr.txt"
CODE_FILE="$TMP_DIR/exit_code.txt"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

open -n -a "$APP" --args \
  "$@" \
  --stdout-file "$OUT_FILE" \
  --stderr-file "$ERR_FILE" \
  --exit-code-file "$CODE_FILE"

for _ in $(seq 1 300); do
  if [ -f "$CODE_FILE" ]; then
    break
  fi
  sleep 0.1
done

if [ -f "$OUT_FILE" ]; then
  cat "$OUT_FILE" | tee "$STDOUT_LOG"
fi

if [ -f "$ERR_FILE" ]; then
  cat "$ERR_FILE" | tee "$STDERR_LOG" >&2
fi

if [ -f "$CODE_FILE" ]; then
  CODE="$(cat "$CODE_FILE")"
  exit "${CODE:-0}"
fi

exit 1
