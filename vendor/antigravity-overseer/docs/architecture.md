# Architecture

## Overview

The system is a local overseer that supervises Antigravity agents by observing and interacting with Antigravity only through the **exposed macOS window UI**.

## Layers

### Layer 0 — Antigravity
The external work system.
Treated as a black box.
Adapter should interact with Agent Manager window; switch to Agent Manager from Editor if it's not visible.

### Layer 1 — macOS Window UI Adapter
The adapter that performs all Antigravity interaction through the exposed macOS window UI.

Responsibilities:
- launch or attach to the visible app/session
- navigate to projects and conversations
- read visible state
- submit messages
- capture screenshots
- extract visible text
- classify obvious UI states
- recover from transient issues

This is the only layer that should contain:
- app navigation rules
- selectors or UI anchors
- screen regions
- click targets
- keyboard interaction logic
- app-specific parsing logic

### Layer 2 — MCP Server
The local tool interface used by management agents.

Responsibilities:
- expose typed tools
- validate inputs
- call the adapter and ledger safely
- return structured outputs with evidence references

### Layer 3 — Watcher / Poller
The persistent local observer.

Responsibilities:
- poll on schedule
- refresh task and conversation state
- detect stalls or likely completion
- capture evidence on state changes
- open alerts
- enqueue manager review events

### Layer 4 — Manager Logic
High-level decision-making.

Responsibilities:
- decide retry vs follow-up vs verification vs escalation
- compare worker and verifier results
- generate summaries
- maintain policy-based supervision

### Optional — Local Lightweight Model Helper
Used only for cheap summarization and classification.

Allowed uses:
- summarize conversation deltas
- classify progress vs filler
- identify completion cues
- label likely failure types

Not allowed:
- unsupervised writes
- task closure without evidence-backed checks
- silent policy changes

## Design Principles

### Evidence before action
Every meaningful observation or action should store:
- timestamp
- screenshot path
- extracted text
- normalized state
- confidence
- related task/conversation identifiers

### Deterministic first
Rules should drive the common path.
Models should only handle ambiguity or summarization.

### Bounded write actions
Every write must:
- verify target context
- capture pre-action evidence
- perform the action
- confirm visible success
- capture post-action evidence

### Graceful degradation
If UI confidence drops:
- enter read-only mode for affected flows
- raise an alert
- avoid confident claims

## Key subsystems

- UI adapter
- parsing and normalization
- MCP server
- watcher
- policy engine
- SQLite ledger
- evidence store
- local model client
