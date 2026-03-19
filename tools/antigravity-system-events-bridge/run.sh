#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/dist/AntigravitySystemEventsBridge.app"
LOG_DIR="/Users/unitybox/nanoclaw/runtime/antigravity-system-events-bridge"
STDOUT_LOG="$LOG_DIR/stdout.log"
STDERR_LOG="$LOG_DIR/stderr.log"
REQUEST_FILE="$LOG_DIR/request.txt"
EXIT_CODE_FILE="$LOG_DIR/exit_code.txt"

mkdir -p "$LOG_DIR"

rm -f "$STDOUT_LOG" "$STDERR_LOG" "$EXIT_CODE_FILE" "$REQUEST_FILE"

if [ "${1:-}" = "--prompt-automation" ]; then
  printf 'prompt-automation' > "$REQUEST_FILE"
elif [ "${1:-}" = "--text" ]; then
  shift
  printf 'send:%s' "${1:-}" > "$REQUEST_FILE"
else
  echo "Unsupported bridge command: ${1:-}" | tee "$STDERR_LOG" >&2
  exit 64
fi

open -n -a "$APP"

for _ in $(seq 1 300); do
  if [ -f "$EXIT_CODE_FILE" ]; then
    break
  fi
  sleep 0.1
done

if [ -f "$STDOUT_LOG" ]; then
  cat "$STDOUT_LOG"
fi

if [ -f "$STDERR_LOG" ]; then
  cat "$STDERR_LOG" >&2
fi

if [ -f "$EXIT_CODE_FILE" ]; then
  CODE="$(cat "$EXIT_CODE_FILE")"
  exit "${CODE:-0}"
fi

echo "Bridge app did not report an exit code." | tee "$STDERR_LOG" >&2
exit 1
