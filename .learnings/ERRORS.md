## [ERR-20260319-001] antigravity_collector_rebuild_tcc_reset

**Logged**: 2026-03-19T00:03:53Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Rebuilding `AntigravityCollector.app` can invalidate its live macOS Accessibility grant even when the bundle path and toggle appear unchanged.

### Error
```
Accessibility access is required for AntigravityCollector. Enable AntigravityCollector.app in System Settings -> Privacy & Security -> Accessibility.
```

### Context
- Operation attempted: rebuild collector helper via `tools/antigravity-collector/build.sh`, then verify live Antigravity reads with `tools/antigravity-collector/run.sh --prompt`
- Environment: NanoClaw running under the `unitybox` GUI session with Antigravity on the same machine
- Impact: Antigravity provider falls back to cached thread data until Accessibility is re-enabled for the rebuilt app bundle

### Suggested Fix
Batch collector changes before rebuilding, warn the user that Accessibility may need to be re-enabled after a rebuild, and avoid unnecessary helper rebuilds during TCC-sensitive debugging.

### Metadata
- Reproducible: yes
- Related Files: tools/antigravity-collector/build.sh, tools/antigravity-collector/src/main.swift

---
