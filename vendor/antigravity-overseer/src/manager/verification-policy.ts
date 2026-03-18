import type { PolicyContext, VerificationPolicyDecision } from "../types/policies.ts";

export function evaluateVerificationPolicy(context: PolicyContext): VerificationPolicyDecision {
  if (context.task.priority === "critical" || context.task.priority === "high") {
    return { requiresVerification: true, reason: "High-priority task" };
  }

  if ((context.falseCompletionRate ?? 0) > 0.2) {
    return { requiresVerification: true, reason: "Conversation has elevated false completion history" };
  }

  return { requiresVerification: false, reason: "Verification not required by current policy" };
}
