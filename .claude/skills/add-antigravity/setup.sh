#!/bin/bash

echo "=== NANOCLAW ANTIGRAVITY ADD-ON SETUP ==="

TARGET_DIR="${ANTIGRAVITY_OVERSEER_DIR:-$HOME/Documents/antigravity-overseer}"

if [ ! -d "$TARGET_DIR" ]; then
  echo "ERROR: antigravity-overseer repo not found at $TARGET_DIR"
  exit 1
fi

echo "Found overseer repo at $TARGET_DIR"
echo "Set these environment variables before restarting NanoClaw:"
echo "ANTIGRAVITY_ENABLED=true"
echo "ANTIGRAVITY_OVERSEER_DIR=$TARGET_DIR"
echo "ANTIGRAVITY_POLL_INTERVAL=2000"
echo "WEBUI_REFRESH_INTERVAL=2000"
echo "STATUS=success"
