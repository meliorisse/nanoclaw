# Event Flow

## High-level flow

1. watcher schedules a check
2. UI adapter refreshes visible project or conversation state
3. snapshot and extracted text are stored
4. parsing normalizes the visible state
5. watcher rules classify the result
6. ledger records any new task events
7. alerts open if thresholds are crossed
8. manager policy decides whether action is needed
9. if action is taken, more evidence is captured
10. result is stored and surfaced through MCP

## Event sources

- scheduled poll
- manual manager request
- write action completion
- alert threshold crossing
- task creation
- verification request
- session/app health change

## Text diagram

```text
Scheduler
  -> Watcher
  -> UI Adapter Refresh
  -> Snapshot + Extracted Text
  -> Parser / Normalizer
  -> Rule Classifier
  -> Task Event + State Transition
  -> Alert Engine
  -> Manager Policy
  -> Optional Supervisory Action
  -> Post-Action Evidence
  -> MCP-visible Result
```

## Event classes

### observation events
Created from passive reads.
Examples:
- conversation refreshed
- new worker message seen
- completion cue detected
- visible loading state persisted

### action events
Created from writes or manager decisions.
Examples:
- supervisory message sent
- verification requested
- follow-up agent created
- retry initiated

### system events
Created from infrastructure conditions.
Examples:
- app unavailable
- low confidence UI parsing
- DB write failed
- local model offline

## Required payload data

Each event should try to include:
- task id
- conversation id
- project id
- source subsystem
- event type
- timestamp
- confidence
- snapshot reference
- summary text
