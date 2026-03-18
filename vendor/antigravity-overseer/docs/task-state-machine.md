# Task State Machine

## Canonical states

- `new`
- `assigned`
- `running`
- `awaiting_response`
- `stalled`
- `retrying`
- `needs_review`
- `verification_running`
- `completed_candidate`
- `completed_verified`
- `failed`
- `abandoned`

## Transition rules

### new -> assigned
Occurs when a task is created and linked to a primary conversation.

### assigned -> running
Occurs when the worker begins visible progress or acknowledges the task meaningfully.

### running -> awaiting_response
Occurs after a supervisor sends a new instruction and the system is waiting for visible worker response.

### awaiting_response -> running
Occurs when meaningful progress appears.

### running -> stalled
Occurs when:
- no meaningful visible progress within threshold
- repeated filler responses appear
- generation appears stuck with no state change
- the worker indicates inability to proceed without new action

### stalled -> retrying
Occurs when the watcher or manager sends a retry or clarification message.

### retrying -> running
Occurs when progress resumes.

### running -> completed_candidate
Occurs when heuristic completion signals are present:
- strong completion language
- referenced artifact or output
- no active work indicators
- task rubric appears substantially addressed

### completed_candidate -> verification_running
Occurs when policy requires a second pass.

### verification_running -> completed_verified
Occurs when the verifier agrees the task meets the rubric.

### verification_running -> needs_review
Occurs when verifier confidence is low or the verifier disagrees.

### any -> failed
Occurs on irrecoverable system, UI, or task failure.

### failed -> abandoned
Occurs after max retries or explicit human dismissal.

## Text diagram

```text
new
  -> assigned
  -> running
  -> awaiting_response
  -> running
  -> stalled
  -> retrying
  -> running
  -> completed_candidate
  -> verification_running
  -> completed_verified

running
  -> needs_review
running
  -> failed
failed
  -> abandoned
```

## State handling rules

- every transition must create a task event
- ambiguous transitions should prefer `needs_review`
- task closure should prefer `completed_candidate` before final verified completion
- write actions should be blocked during low-confidence UI drift unless explicitly overridden
