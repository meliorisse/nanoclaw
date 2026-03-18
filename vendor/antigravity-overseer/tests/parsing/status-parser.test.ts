import test from "node:test";
import assert from "node:assert/strict";
import { parseStatusFromVisibleText } from "../../src/adapter/parsing/status-parser.ts";

test("status parser detects loading cues", () => {
  const parsed = parseStatusFromVisibleText("Worker is thinking...\nLoading artifacts");
  assert.equal(parsed.status, "loading");
  assert.ok(parsed.confidence >= 0.7);
});

test("status parser detects completion cues", () => {
  const parsed = parseStatusFromVisibleText("Completed\nDone and ready for review");
  assert.equal(parsed.status, "completed");
});
