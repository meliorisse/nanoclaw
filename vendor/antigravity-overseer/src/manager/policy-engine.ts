import type { PolicyContext } from "../types/policies.ts";
import { evaluateEscalationPolicy } from "./escalation-policy.ts";
import { evaluateRetryPolicy } from "./retry-policy.ts";
import { evaluateVerificationPolicy } from "./verification-policy.ts";

export function evaluatePolicies(context: PolicyContext, maxRetriesPerTask: number) {
  return {
    retry: evaluateRetryPolicy(context, maxRetriesPerTask),
    verification: evaluateVerificationPolicy(context),
    escalation: evaluateEscalationPolicy(context)
  };
}
