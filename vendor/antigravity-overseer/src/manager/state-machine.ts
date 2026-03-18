import type { TaskState } from "../types/domain.ts";
import type { StateTransitionRecord } from "../types/events.ts";

const ALLOWED_TRANSITIONS: Record<TaskState, TaskState[]> = {
  new: ["assigned", "failed"],
  assigned: ["running", "failed"],
  running: ["awaiting_response", "stalled", "completed_candidate", "needs_review", "failed"],
  awaiting_response: ["running", "stalled", "failed"],
  stalled: ["retrying", "needs_review", "failed"],
  retrying: ["running", "needs_review", "failed"],
  needs_review: ["retrying", "verification_running", "failed", "completed_verified"],
  verification_running: ["completed_verified", "needs_review", "failed"],
  completed_candidate: ["verification_running", "completed_verified", "needs_review", "failed"],
  completed_verified: [],
  failed: ["abandoned"],
  abandoned: []
};

export function canTransition(fromState: TaskState, toState: TaskState): boolean {
  return ALLOWED_TRANSITIONS[fromState].includes(toState);
}

export function transitionTaskState(input: {
  taskId: string;
  fromState: TaskState;
  toState: TaskState;
  reason: string;
  confidence: number;
}): StateTransitionRecord {
  if (!canTransition(input.fromState, input.toState)) {
    throw new Error(`Invalid task transition: ${input.fromState} -> ${input.toState}`);
  }

  return {
    taskId: input.taskId,
    fromState: input.fromState,
    toState: input.toState,
    reason: input.reason,
    confidence: input.confidence
  };
}

export function preferReviewOnAmbiguity(confidence: number, proposedState: TaskState): TaskState {
  if (confidence < 0.6 && proposedState !== "failed") {
    return "needs_review";
  }

  return proposedState;
}
