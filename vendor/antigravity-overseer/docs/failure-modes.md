# Failure Modes

## Philosophy

The system should fail explicitly, with evidence, and avoid confident invisible errors.

## UI failures

### app window unavailable
Symptoms:
- no exposed macOS window UI detected
- unable to attach or focus session

Default handling:
- create system alert
- suspend write actions
- continue health checks

### UI drift
Symptoms:
- expected anchors not found
- parsing confidence below threshold
- repeated mismatch between expected and visible structure

Default handling:
- enter read-only mode for affected flow
- capture evidence
- create alert
- require revalidation before writes resume

### submit not confirmed
Symptoms:
- typed instruction not visibly posted
- expected confirmation cue absent

Default handling:
- do not assume success
- capture evidence
- bounded retry
- open alert if repeated

### stuck loading state
Symptoms:
- same loading or pending screen across repeated polls

Default handling:
- classify as transient first
- then stalled
- then alert if threshold exceeded

## Task failures

### no meaningful progress
Symptoms:
- no substantive change
- repeated generic filler
- no deliverable cues

Default handling:
- mark stalled
- possibly retry
- escalate after threshold

### contradictory output
Symptoms:
- worker claims mutually incompatible states
- completion claim without artifact or evidence

Default handling:
- request verification or clarification
- mark needs_review if unresolved

### likely hallucinated completion
Symptoms:
- polished answer with missing deliverables
- strong completion language but no visible artifact or grounding

Default handling:
- create verifier workflow
- hold final completion

### gave up / abandoned
Symptoms:
- worker explicitly stops
- repeated inability messages
- no recovery after retries

Default handling:
- failed or abandoned depending on policy and retry count

## System failures

### DB failure
- create urgent system alert
- pause transitions if ledger integrity is at risk

### snapshot save failure
- warn and retry
- block write actions if evidence cannot be stored reliably

### local model unavailable
- degrade to deterministic mode
- do not fail the whole system

### MCP unavailable
- watcher may continue locally
- create service alert

## Severity guide

- `info`: non-critical observation
- `warning`: recoverable issue
- `high`: meaningful task risk
- `critical`: system integrity or complete adapter outage
