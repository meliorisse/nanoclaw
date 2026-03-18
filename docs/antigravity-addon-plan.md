# Antigravity Add-on Plan

## Goal

Extend NanoClaw so the Web UI can supervise both:

- local NanoClaw agent threads
- Antigravity-backed high-effort threads managed through the external `antigravity-overseer` repo

## Current State

NanoClaw already has:

- a custom Web UI channel at [src/channels/webui.ts](/Users/unitybox/nanoclaw/src/channels/webui.ts)
- a static frontend at [src/channels/webui-frontend/index.html](/Users/unitybox/nanoclaw/src/channels/webui-frontend/index.html)
- live queue/process tracking in [src/group-queue.ts](/Users/unitybox/nanoclaw/src/group-queue.ts)
- local task, chat, and session persistence in [src/db.ts](/Users/unitybox/nanoclaw/src/db.ts)

It did not previously have:

- a provider-aware thread model
- an Antigravity integration client
- a unified control surface for effort shifting

## Rollout Phases

### Phase 1: Unified Visibility

Implemented in this scaffold:

- provider-aware thread types in [src/types.ts](/Users/unitybox/nanoclaw/src/types.ts)
- persistent `agent_threads` and `agent_thread_actions` tables in [src/db.ts](/Users/unitybox/nanoclaw/src/db.ts)
- local thread derivation plus unified dashboard service in [src/agent-dashboard.ts](/Users/unitybox/nanoclaw/src/agent-dashboard.ts)
- Antigravity read adapter in [src/providers/antigravity.ts](/Users/unitybox/nanoclaw/src/providers/antigravity.ts)
- Web UI dashboard and effort controls in [src/channels/webui.ts](/Users/unitybox/nanoclaw/src/channels/webui.ts) and [src/channels/webui-frontend/index.html](/Users/unitybox/nanoclaw/src/channels/webui-frontend/index.html)

### Phase 2: Provider Mapping

Still needed:

- explicit mapping between NanoClaw groups and Antigravity projects/workspaces
- per-thread routing rules for escalation and de-escalation
- provider-specific handoff prompts and summaries

Recommended additions:

- `antigravity_group_mappings` table
- UI to assign a NanoClaw group to an Antigravity workspace
- default escalation target selection

### Phase 3: Live Effort Shifting

Still needed:

- local -> Antigravity handoff action that creates or resumes a real Antigravity thread
- Antigravity -> local handoff action that snapshots visible context and seeds a local NanoClaw thread
- operator-visible audit trail for all transitions

Recommended implementation:

- keep Antigravity integration external through the overseer repo
- invoke overseer MCP tools instead of reading its SQLite directly
- require visible confirmation before marking a handoff complete

### Phase 4: Control Loop

Still needed:

- automatic policy to escalate long-running or stalled local work
- automatic policy to pull high-effort work back to local when lightweight follow-up remains
- health-based pause logic when Antigravity is unavailable

## Configuration

The scaffold expects these environment variables:

- `ANTIGRAVITY_ENABLED=true`
- `ANTIGRAVITY_OVERSEER_DIR=/absolute/path/to/antigravity-overseer`
- `ANTIGRAVITY_POLL_INTERVAL=2000`
- `WEBUI_REFRESH_INTERVAL=2000`

## Known Gaps

- Antigravity effort switching is still scaffolded, not fully executed
- the overseer must have a real live macOS UI backend for production use
- group/project mapping is not implemented yet

## Recommended Next Build Steps

1. add `antigravity_group_mappings`
2. add a concrete local -> Antigravity escalation action
3. add a concrete Antigravity -> local de-escalation action
4. add a timeline view per thread in the Web UI
5. add tests around dashboard refresh and provider handoff flows
