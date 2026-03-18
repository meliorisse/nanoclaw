# Data Model

## Storage choice

Use SQLite first.
The ledger is local, auditable, and easy to back up.

## Tables

### projects
Represents Antigravity projects.

Suggested fields:
- `id`
- `external_project_ref`
- `name`
- `last_seen_at`
- `metadata_json`
- `created_at`
- `updated_at`

### conversations
Represents conversation or agent threads.

Suggested fields:
- `id`
- `project_id`
- `external_conversation_ref`
- `title`
- `status`
- `last_message_at`
- `last_seen_at`
- `created_at`
- `updated_at`

### agents
Represents logical worker identities.

Suggested fields:
- `id`
- `conversation_id`
- `role` (`primary`, `verifier`, `followup`, `supervisor`)
- `status`
- `created_at`
- `updated_at`

### tasks
Represents supervised units of work.

Suggested fields:
- `id`
- `project_id`
- `primary_conversation_id`
- `title`
- `objective`
- `state`
- `priority`
- `created_at`
- `updated_at`

### task_events
Immutable timeline entries.

Suggested fields:
- `id`
- `task_id`
- `type`
- `source`
- `payload_json`
- `created_at`

### snapshots
Evidence records.

Suggested fields:
- `id`
- `project_id`
- `conversation_id`
- `task_id`
- `screenshot_path`
- `extracted_text`
- `ui_state`
- `confidence`
- `created_at`

### alerts
Open issues requiring action.

Suggested fields:
- `id`
- `task_id`
- `severity`
- `kind`
- `status`
- `summary`
- `created_at`
- `resolved_at`

### supervisory_actions
Supervisor messages or management steps.

Suggested fields:
- `id`
- `task_id`
- `conversation_id`
- `action_type`
- `instruction_text`
- `result`
- `created_at`

## Invariants

- every task belongs to a project
- every conversation belongs to a project
- every agent belongs to a conversation
- every meaningful state change should create a `task_event`
- every significant read/write observation should create a `snapshot`
- every alert should point to enough evidence to explain why it exists

## Suggested indexes

- conversations by `project_id`
- tasks by `project_id`
- tasks by `state`
- alerts by `status`
- snapshots by `conversation_id`, `created_at`
- task_events by `task_id`, `created_at`

## Optional future tables

- `reliability_scores`
- `message_templates`
- `verification_reports`
- `health_checks`
