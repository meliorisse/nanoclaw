import type { TaskState } from "../types/domain.ts";
import { preferReviewOnAmbiguity } from "../manager/state-machine.ts";
import type { WatcherClassification } from "./classifier.ts";

export function determineWatcherState(
  currentState: TaskState,
  classification: WatcherClassification
): TaskState {
  if (currentState === "awaiting_response" && classification.nextState === "running") {
    return "running";
  }

  return preferReviewOnAmbiguity(classification.confidence, classification.nextState);
}
