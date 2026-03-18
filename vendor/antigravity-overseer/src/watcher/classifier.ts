import { isOlderThan } from "../utils/time.ts";

export interface WatcherObservationInput {
  visibleText: string;
  status: string;
  confidence: number;
  lastMeaningfulProgressAt: string | null;
  stalledAfterSeconds: number;
  completionCandidateConfidence: number;
}

export interface WatcherClassification {
  nextState: "running" | "stalled" | "completed_candidate" | "needs_review";
  reason: string;
  confidence: number;
}

const FILLER_PATTERNS = [
  "still working on it",
  "let me know if you'd like",
  "i can also",
  "i'm unable to",
  "cannot access"
];

export function classifyObservation(input: WatcherObservationInput): WatcherClassification {
  const text = input.visibleText.toLowerCase();

  if (input.confidence < 0.4) {
    return {
      nextState: "needs_review",
      reason: "UI confidence too low for deterministic classification",
      confidence: input.confidence
    };
  }

  if (
    (text.includes("done") || text.includes("completed") || text.includes("finished")) &&
    input.confidence >= input.completionCandidateConfidence
  ) {
    return {
      nextState: "completed_candidate",
      reason: "Completion language detected with sufficient confidence",
      confidence: input.confidence
    };
  }

  if (
    FILLER_PATTERNS.some((pattern) => text.includes(pattern)) ||
    isOlderThan(input.lastMeaningfulProgressAt, input.stalledAfterSeconds)
  ) {
    return {
      nextState: "stalled",
      reason: "No meaningful progress detected within the stall threshold",
      confidence: Math.max(0.6, input.confidence)
    };
  }

  return {
    nextState: "running",
    reason: "Visible progress appears active",
    confidence: Math.max(0.58, input.confidence)
  };
}
