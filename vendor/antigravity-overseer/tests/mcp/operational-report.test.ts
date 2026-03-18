import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRuntimeContext } from "../../src/services/runtime.ts";
import { syncVisibleState } from "../../src/services/visible-sync.ts";
import { getOperationalReportTool } from "../../src/mcp/tools/get-operational-report.ts";

const fixture = `
Start new conversation
Chat History
Workspaces
nanoclaw
Fixing Host Mode Responses... now
Agent Manager
nanoclaw / Fixing Host Mode Responses
requests time out after 3 minutes of waiting.
Thought for 3s
Two places to update.
`;

test("operational report summarizes attention states and alert runbooks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ag-overseer-report-test-"));
  const visibleTextPath = path.join(root, "visible.txt");
  await writeFile(visibleTextPath, fixture, "utf8");

  process.env.OVERSEER_DB_PATH = path.join(root, "overseer.sqlite");
  process.env.OVERSEER_EVIDENCE_DIR = path.join(root, "evidence");
  process.env.OVERSEER_LOGS_DIR = path.join(root, "logs");
  process.env.OVERSEER_PROFILE_PATH = path.join(root, "profile");
  process.env.OVERSEER_VISIBLE_TEXT_PATH = visibleTextPath;
  process.env.OVERSEER_SCREEN_TEXT_COMMAND = "";

  const runtime = await createRuntimeContext();
  const sync = await syncVisibleState(runtime);
  const overview = await runtime.adapter.getScreenOverview();
  const task = runtime.repositories.tasks.list()[0];

  assert.ok(task);
  runtime.repositories.tasks.updateState(task!.id, "stalled");
  runtime.repositories.alerts.create({
    taskId: task!.id,
    severity: "warning",
    kind: "stalled",
    summary: "No progress detected across recent polls."
  });

  const report = await getOperationalReportTool(
    runtime.config,
    sync,
    overview.data.activeConversationRef,
    runtime.repositories.tasks,
    runtime.repositories.conversations,
    runtime.repositories.alerts
  );

  assert.equal(report.ok, false);
  assert.equal(report.data.health.backendMode, "fixture");
  assert.equal(report.data.tasks.visibleTotal, 1);
  assert.equal(report.data.tasks.ledgerTotal, 1);
  assert.equal(report.data.tasks.visibleByState.stalled, 1);
  assert.equal(report.data.tasks.needsAttentionCount, 1);
  assert.equal(report.data.tasks.needsAttention[0]?.conversationRef, "nanoclaw:fixing-host-mode-responses");
  assert.equal(report.data.alerts.openCount, 1);
  assert.equal(report.data.alerts.bySeverity.warning, 1);
  assert.equal(report.data.alerts.open[0]?.runbook?.title, "Runbook: stalled worker");
});
