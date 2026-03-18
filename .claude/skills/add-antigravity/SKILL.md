---
name: add-antigravity
description: Attach the external antigravity-overseer repo as a NanoClaw add-on so the Web UI can monitor Antigravity-backed high-effort threads alongside local NanoClaw threads.
---

# Add Antigravity

This add-on integrates NanoClaw with the external `antigravity-overseer` repository instead of copying its code into NanoClaw.

## What it adds

- provider-aware thread dashboard in the Web UI
- Antigravity provider scaffolding
- environment variables for pointing NanoClaw at the overseer repo
- effort-shift controls and action logging

## External dependency

Expected repo:

- `~/Documents/antigravity-overseer`

Expected entrypoint:

- `src/mcp/server.ts`

## Setup

1. Ensure the overseer repo exists and is runnable.
2. Set:
   - `ANTIGRAVITY_ENABLED=true`
   - `ANTIGRAVITY_OVERSEER_DIR=~/Documents/antigravity-overseer`
3. Restart NanoClaw.

## Important limitation

This skill scaffolds the control plane and visibility layer. Full live escalation/de-escalation still depends on the overseer having reliable macOS UI read/write automation.
