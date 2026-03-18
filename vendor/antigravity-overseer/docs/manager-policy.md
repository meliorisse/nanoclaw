# Manager Policy

## Purpose

The manager layer exists to make higher-level supervisory decisions after deterministic rules and evidence collection have done the first pass.

## Default principles

- prefer deterministic rules first
- require evidence for meaningful claims
- avoid unnecessary manager invocation
- use verification only when it adds value
- escalate ambiguity rather than invent certainty

## Retry policy

A retry may be triggered when:
- the worker stalled
- the worker misunderstood scope
- the worker needs a checklist reminder
- visible progress resumed poorly after a partial attempt

A retry should not be triggered indefinitely.
Suggested controls:
- max retries per task
- cooldown between retries
- stronger wording after repeated failures

## Verification policy

Create a verifier when:
- task priority is high
- a completion claim lacks strong evidence
- the worker has low reliability history
- the output affects code, architecture, or major decisions
- the completion happened unusually quickly

Do not verify every low-risk task.

## Escalation policy

Escalate when:
- retries exhausted
- UI drift blocks the write path
- verifier strongly disagrees
- task repeatedly re-enters stalled state
- system integrity is compromised

## Reliability signals

Track per conversation or task:
- retry count
- stall count
- verifier disagreement rate
- false completion rate
- average time to meaningful progress

Use these signals to tune:
- when to spawn verifier
- when to escalate faster
- when to keep a task in read-only monitoring

## Suggested supervisory message templates

### Retry prompt
You stopped making concrete progress. Continue from the last successful step, state the next 3 actions, and do not stop until the requested deliverable is complete.

### Scope reminder
Re-read the task and produce only the requested deliverables. Do not substitute commentary for completion.

### Deliverable checklist
Before you claim completion, explicitly confirm each requested deliverable and where it appears.

### Verification prompt
Review the primary worker's output against the rubric. Identify omissions, unsupported claims, contradictions, and whether the task is actually complete.

## Manager invocation triggers

- new critical alert
- task enters `needs_review`
- verifier disagreement
- repeated stall after retry
- likely hallucinated completion
