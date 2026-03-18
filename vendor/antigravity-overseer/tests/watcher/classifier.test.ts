import test from "node:test";
import assert from "node:assert/strict";
import { classifyObservation } from "../../src/watcher/classifier.ts";

test("classifier marks low-confidence observations for review", () => {
  const result = classifyObservation({
    visibleText: "Some text",
    status: "unknown",
    confidence: 0.2,
    lastMeaningfulProgressAt: new Date().toISOString(),
    stalledAfterSeconds: 900,
    completionCandidateConfidence: 0.8
  });

  assert.equal(result.nextState, "needs_review");
});

test("classifier detects completion candidate", () => {
  const result = classifyObservation({
    visibleText: "Finished implementation and completed tests",
    status: "completed",
    confidence: 0.85,
    lastMeaningfulProgressAt: new Date().toISOString(),
    stalledAfterSeconds: 900,
    completionCandidateConfidence: 0.8
  });

  assert.equal(result.nextState, "completed_candidate");
});

test("classifier marks stalled filler responses", () => {
  const result = classifyObservation({
    visibleText: "Still working on it, let me know if you'd like more detail.",
    status: "idle",
    confidence: 0.7,
    lastMeaningfulProgressAt: new Date().toISOString(),
    stalledAfterSeconds: 900,
    completionCandidateConfidence: 0.8
  });

  assert.equal(result.nextState, "stalled");
});
