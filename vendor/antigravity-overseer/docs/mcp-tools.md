# MCP Tools

## Tool design rules

Every tool should:
- return structured data
- include confidence where applicable
- include evidence references where possible
- avoid hiding uncertainty
- avoid making claims without a supporting snapshot or ledger event

## Initial tools

### list_projects()
Returns:
- project identifiers
- names
- last seen times
- optional confidence
- evidence references if directly refreshed

### list_conversations(project_id)
Returns:
- conversation identifiers
- titles
- status
- last message time
- evidence references

### get_conversation(conversation_id, limit?)
Returns:
- normalized conversation transcript
- last visible messages
- parsed summary
- confidence
- evidence references

### send_message(conversation_id, text)
Behavior:
- verify correct visible target
- capture pre-action screenshot
- submit message
- confirm visible posting or equivalent success signal
- capture post-action screenshot
- create supervisory action record

Returns:
- action result
- confidence
- evidence references
- any warning flags

### get_status(conversation_id)
Returns:
- normalized state classification
- visible status cues
- confidence
- evidence references

### get_health()
Returns:
- current backend mode
- whether screen text and screenshot sources are configured
- visible workspace and conversation counts
- active conversation reference when available
- warnings for unreadable or unconfigured sources

### get_operational_report()
Returns:
- overall readiness flag
- embedded health report
- task totals grouped by state
- attention-needed tasks
- open alerts grouped by severity
- runbook references for recognized alert kinds

### capture_evidence(conversation_id)
Returns:
- screenshot path
- extracted text
- normalized state
- confidence

### create_followup_agent(project_id, brief, parent_task_id?)
Behavior:
- navigate to project
- initiate follow-up agent or thread through the exposed macOS window UI
- capture evidence of creation
- create ledger entries

Returns:
- created conversation reference if available
- confidence
- evidence references

### list_alerts(status?)
Returns:
- open or filtered alerts
- severity
- kind
- summary
- linked evidence

### acknowledge_alert(alert_id, note?)
Returns:
- updated alert status
- ledger confirmation

### get_task_summary(task_id)
Returns:
- current task state
- short progress summary
- related conversations
- recent alerts
- confidence and evidence references

### list_tasks(project_id?)
Returns:
- tasks
- current state
- priority
- last updated time

### get_task_timeline(task_id)
Returns:
- ordered events
- snapshots
- supervisory actions
- alert history

### retry_task(task_id, instruction?)
Behavior:
- apply retry policy
- optionally send retry instruction
- record reason and evidence
- transition state if allowed

### request_verification(task_id, rubric?)
Behavior:
- apply verification policy
- create or assign verifier workflow
- create task events and evidence bundle

## Non-goals for tools

- no hidden backend calls
- no “magic” task closure without evidence
- no silent retries without records
- no UI-specific details exposed to manager clients unless useful for debugging
