# Antigravity Overseer

This repository turns the spec package in [`docs/`](./docs) into a runnable first slice of a local overseer stack for supervising Antigravity work through the **exposed macOS window UI**.

## Current slice

The implementation in this repo establishes:

- a TypeScript-first project scaffold
- a config loader with safe defaults
- structured logging
- a local SQLite ledger and migration entrypoint
- deterministic task state transitions
- watcher classification rules
- evidence capture plumbing
- a macOS window UI adapter interface plus a low-confidence bootstrap implementation
- an MCP-shaped local tool registry for read flows and bounded writes
- initial tests for parsing, watcher classification, and state transitions

## Constraints

All interaction with Antigravity must happen through the **exposed macOS window UI**.

This repo does not use:

- private APIs
- reverse-engineered backend calls
- hidden network integrations
- stealth or evasion behavior

## Repo layout

The code follows the structure described in [`docs/repository-structure.md`](./docs/repository-structure.md). The most important directories are:

- `src/adapter`: UI-facing adapter contracts, parsing, and macOS window stubs
- `src/db`: SQLite schema, migration runner, and repositories
- `src/mcp`: typed tool registry and local invocation surface
- `src/watcher`: deterministic polling and classification logic
- `src/manager`: policy scaffolding and task state machine
- `tests/`: state and watcher coverage

## Runtime notes

The project uses native TypeScript execution from Node.js 22 via `--experimental-strip-types`, so the first slice can run without a full dependency install. SQLite uses Node's built-in `node:sqlite` module.

Because no concrete macOS automation framework is wired in yet, the initial adapter intentionally degrades safely:

- read flows return low-confidence, evidence-backed results
- write flows require visible confirmation hooks before they will report success
- ambiguous situations fall back to `needs_review`

## Commands

```bash
npm run migrate
npm run watcher -- --once
npm run watcher
npm run doctor
npm run mcp -- get_health '{}'
npm run mcp -- get_operational_report '{}'
npm run mcp -- list_tasks '{}'
npm test
```

## Configuration

Copy [`.env.example`](./.env.example) or set environment variables directly.

Important variables:

- `OVERSEER_DB_PATH`
- `OVERSEER_EVIDENCE_DIR`
- `OVERSEER_LOG_LEVEL`
- `OVERSEER_WRITES_ENABLED`
- `OVERSEER_VISIBLE_TEXT_PATH`
- `OVERSEER_SCREEN_TEXT_COMMAND`
- `OVERSEER_SCREENSHOT_COMMAND`

`OVERSEER_VISIBLE_TEXT_PATH` lets the bootstrap adapter read visible text from a local fixture file while a real macOS automation backend is still being integrated.

For a live backend, you can point the overseer at external collectors instead:

- `OVERSEER_SCREEN_TEXT_COMMAND`: shell command that prints the current Agent Manager text to stdout
- `OVERSEER_SCREENSHOT_COMMAND`: shell command that writes a screenshot file, with `{output}` available as a placeholder for the destination path

Example helper scripts are included:

- [scripts/emit-sample-screen-text.sh](/Users/unitybox/Documents/antigravity-overseer/scripts/emit-sample-screen-text.sh)
- [scripts/write-placeholder-screenshot.sh](/Users/unitybox/Documents/antigravity-overseer/scripts/write-placeholder-screenshot.sh)

The parser now supports raw Agent Manager text dumps that preserve the sidebar workspace list plus the active conversation pane. A representative fixture looks like:

```text
Start new conversation
Chat History
Workspaces
TGE
Pushing Code Changes 13d
Campaign UI Bug Fixing 14d
nanoclaw
Fixing Host Mode Responses... now
Agent Manager
nanoclaw / Fixing Host Mode Responses
requests time out after 3 minutes of waiting...
Thought for 3s
Two places to update...
```

A sample file is included at [runtime/sample-visible-window.txt](/Users/unitybox/Documents/antigravity-overseer/runtime/sample-visible-window.txt).

Generated runtime state such as the local SQLite ledger and captured evidence stays under `runtime/` but should remain local-only and out of version control.

## Implementation status

Implemented now:

- config, logging, schema, repositories
- task state machine
- watcher classifier and synced poll loop
- evidence persistence path
- fixture-driven project/conversation parsing
- tool registry for `list_projects`, `list_conversations`, `get_conversation`, `get_status`, `capture_evidence`, `list_tasks`, `list_alerts`, `get_task_summary`, `get_task_timeline`, `retry_task`, `request_verification`, `create_followup_agent`, and `send_message`
- health/doctor commands for backend readiness
- operational report output with runbook hints for open alerts

Planned next:

- concrete macOS window automation hooks
- richer conversation/project parsing
- alert debounce and health polling
- verifier/follow-up workflows
- full MCP protocol transport

## Docs

The original design package remains in [`docs/`](./docs):

1. [`docs/implementation-plan.md`](./docs/implementation-plan.md)
2. [`docs/architecture.md`](./docs/architecture.md)
3. [`docs/repository-structure.md`](./docs/repository-structure.md)
4. [`docs/data-model.md`](./docs/data-model.md)
5. [`docs/mcp-tools.md`](./docs/mcp-tools.md)
6. [`docs/task-state-machine.md`](./docs/task-state-machine.md)
7. [`docs/event-flow.md`](./docs/event-flow.md)
8. [`docs/failure-modes.md`](./docs/failure-modes.md)
9. [`docs/runbooks.md`](./docs/runbooks.md)
10. [`docs/manager-policy.md`](./docs/manager-policy.md)
11. [`docs/config-spec.md`](./docs/config-spec.md)
12. [`docs/codex-handoff.md`](./docs/codex-handoff.md)
