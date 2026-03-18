import test from "node:test";
import assert from "node:assert/strict";
import { canTransition, preferReviewOnAmbiguity, transitionTaskState } from "../../src/manager/state-machine.ts";

test("allows running to completed candidate", () => {
  assert.equal(canTransition("running", "completed_candidate"), true);
});

test("ambiguous classifications fall back to needs_review", () => {
  assert.equal(preferReviewOnAmbiguity(0.41, "running"), "needs_review");
});

test("throws on invalid transitions", () => {
  assert.throws(() =>
    transitionTaskState({
      taskId: "task_1",
      fromState: "new",
      toState: "completed_verified",
      reason: "Impossible jump",
      confidence: 0.9
    })
  );
});
