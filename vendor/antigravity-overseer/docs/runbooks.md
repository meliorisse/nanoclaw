# Runbooks

The operational report surface links open alerts back to these runbooks when the alert kind is recognized.

## Runbook: UI drift detected

1. capture screenshot
2. store extracted visible text
3. compare confidence to threshold
4. place affected flow into read-only mode
5. open alert with evidence bundle
6. prevent further writes for that flow
7. require operator or revalidation path before resuming writes

## Runbook: stalled worker

1. confirm lack of progress across multiple polls
2. capture evidence bundle
3. mark task `stalled`
4. apply retry policy
5. if allowed, send follow-up instruction
6. capture post-action evidence
7. reopen task as `retrying`
8. escalate if repeated

## Runbook: likely hallucinated completion

1. capture current conversation evidence
2. compare against task rubric
3. mark `completed_candidate`
4. if policy requires, request verifier workflow
5. do not mark final completion until verified or reviewed

## Runbook: app/session unavailable

1. record health failure
2. create alert
3. suspend writes
4. continue low-frequency health polling
5. restore normal operation only after successful reattachment and evidence capture

## Runbook: send message failure

1. verify target conversation again
2. capture pre-retry evidence
3. attempt bounded retry
4. if still not visibly confirmed, open alert
5. do not claim message delivery

## Runbook: verifier disagreement

1. collect worker output and verifier findings
2. attach both to task summary
3. mark `needs_review`
4. optionally generate a clarifying follow-up instruction
5. escalate to manager or human depending on policy

## Runbook: evidence storage degraded

1. create system alert
2. stop non-essential writes
3. keep minimal health checks
4. restore evidence pipeline before resuming normal supervisory actions
