import type { PolicyContext, RetryPolicyDecision } from "../types/policies.ts";

export function evaluateRetryPolicy(
  context: PolicyContext,
  maxRetriesPerTask: number
): RetryPolicyDecision {
  if (context.retryCount >= maxRetriesPerTask) {
    return { shouldRetry: false, reason: "Max retries reached" };
  }

  if (context.task.state === "stalled" || context.task.state === "needs_review") {
    return { shouldRetry: true, reason: "Task is stalled and still within retry budget" };
  }

  return { shouldRetry: false, reason: "Task is not in a retryable state" };
}
