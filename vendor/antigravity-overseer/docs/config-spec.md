# Config Spec

## Configuration goals

- easy local setup
- safe defaults
- environment override support
- clear thresholds and paths

## Suggested config keys

### app/session
- `appName`
- `windowTitlePattern`
- `profilePath`
- `evidenceDir`
- `logsDir`

### polling
- `projectRefreshSeconds`
- `activeConversationRefreshSeconds`
- `stalledConversationRefreshSeconds`
- `healthCheckSeconds`

### thresholds
- `stalledAfterSeconds`
- `uiDriftConfidenceThreshold`
- `maxRetriesPerTask`
- `alertDebounceCount`
- `completionCandidateConfidence`

### writeControls
- `writesEnabled`
- `readOnlyOnDrift`
- `confirmBeforeHighRiskWrites`

### localModel
- `enabled`
- `baseUrl`
- `modelName`
- `timeoutMs`

### logging
- `level`
- `json`
- `redactSensitiveFields`

## Example YAML

```yaml
appName: "Antigravity"
windowTitlePattern: "Antigravity"
profilePath: "./runtime/profile"
evidenceDir: "./runtime/evidence"
logsDir: "./runtime/logs"

polling:
  projectRefreshSeconds: 300
  activeConversationRefreshSeconds: 60
  stalledConversationRefreshSeconds: 180
  healthCheckSeconds: 120

thresholds:
  stalledAfterSeconds: 900
  uiDriftConfidenceThreshold: 0.72
  maxRetriesPerTask: 3
  alertDebounceCount: 2
  completionCandidateConfidence: 0.80

writeControls:
  writesEnabled: true
  readOnlyOnDrift: true
  confirmBeforeHighRiskWrites: true

localModel:
  enabled: true
  baseUrl: "http://127.0.0.1:1234/v1"
  modelName: "local-helper"
  timeoutMs: 15000

logging:
  level: "info"
  json: true
  redactSensitiveFields: true
```

## Config rules

- no hardcoded secrets
- no hidden behavior toggles
- all risky write behavior should be explicit
- drift-related write lock should default on
