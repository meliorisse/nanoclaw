import type { EscalationPolicyDecision, PolicyContext } from "../types/policies.ts";

export function evaluateEscalationPolicy(context: PolicyContext): EscalationPolicyDecision {
  if (context.task.state === "failed") {
    return { shouldEscalate: true, severity: "critical", reason: "Task entered failed state" };
  }

  if (context.stallCount >= 2 && context.retryCount >= 1) {
    return { shouldEscalate: true, severity: "high", reason: "Repeated stall after retry" };
  }

  return { shouldEscalate: false, severity: context.task.priority, reason: "No escalation trigger matched" };
}
