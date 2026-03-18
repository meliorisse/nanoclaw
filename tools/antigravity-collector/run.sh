#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN="$ROOT/dist/AntigravityCollector.app/Contents/MacOS/antigravity-collector"
LOG_DIR="/Users/unitybox/nanoclaw/runtime/antigravity-collector"
STDOUT_LOG="$LOG_DIR/stdout.log"
STDERR_LOG="$LOG_DIR/stderr.log"

mkdir -p "$LOG_DIR"

"$BIN" \
  2> >(tee "$STDERR_LOG" >&2) \
  | tee "$STDOUT_LOG"
