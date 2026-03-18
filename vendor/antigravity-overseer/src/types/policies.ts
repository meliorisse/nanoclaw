import type { Task, TaskPriority } from "./domain.ts";

export interface RetryPolicyDecision {
  shouldRetry: boolean;
  reason: string;
}

export interface VerificationPolicyDecision {
  requiresVerification: boolean;
  reason: string;
}

export interface EscalationPolicyDecision {
  shouldEscalate: boolean;
  severity: TaskPriority;
  reason: string;
}

export interface PolicyContext {
  task: Task;
  retryCount: number;
  stallCount: number;
  verifierDisagreementRate?: number;
  falseCompletionRate?: number;
}
