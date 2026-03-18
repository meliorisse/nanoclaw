# Codex Handoff

Use this file as the direct handoff note for the implementation agent.

## Mission

Build a local overseer stack for supervising work performed inside Antigravity.

## Critical requirement

All interaction with Antigravity must occur only through the **exposed macOS window UI**.

Do not describe the integration as being through the browser.
Do not use private APIs, reverse-engineered network calls, hidden backend endpoints, or bypass techniques.

## What to build

Create:
- a repository scaffold
- a macOS Window UI Adapter interface and first implementation
- a SQLite ledger
- an MCP server with typed tools
- a watcher / poller
- manager policy scaffolding
- evidence capture
- docs and tests

## Read these docs first

1. architecture.md
2. implementation-plan.md
3. repository-structure.md
4. data-model.md
5. mcp-tools.md
6. task-state-machine.md
7. event-flow.md
8. failure-modes.md
9. runbooks.md
10. manager-policy.md
11. config-spec.md

## Hard constraints

- deterministic rules first
- evidence before action
- all meaningful actions must be auditable
- write actions must be visibly confirmed
- ambiguous UI interpretation must degrade safely
- no stealth or anti-detection behavior
- no hidden backend integrations

## Implementation expectations

Start by:
1. proposing the concrete implementation plan
2. generating the repository structure
3. implementing the first working vertical slice

The first vertical slice should include:
- config
- logging
- SQLite schema
- task ledger repositories
- adapter interface
- minimal adapter implementation
- MCP server
- watcher
- evidence capture pipeline
- task state machine skeleton
- tests for parsing/state logic

## Output expectations

Produce:
- code
- migrations
- README
- docs
- tests
- runnable commands

## Tone and discipline

Be explicit about uncertainty.
Do not pretend UI inference is perfect.
Prefer evidence-backed results.
Fail into `needs_review` when confidence is low.
