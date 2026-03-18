import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRuntimeContext } from "../../src/services/runtime.ts";
import { syncVisibleState } from "../../src/services/visible-sync.ts";
import { getHealthTool } from "../../src/mcp/tools/get-health.ts";

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

test("health tool reports fixture-backed readiness and visible counts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ag-overseer-health-test-"));
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
  const report = await getHealthTool(runtime.config, sync, overview.data.activeConversationRef);

  assert.equal(report.ok, true);
  assert.equal(report.data.backendMode, "fixture");
  assert.equal(report.data.visibleProjects, 1);
  assert.equal(report.data.visibleConversations, 1);
  assert.equal(report.data.activeConversationRef, "nanoclaw:fixing-host-mode-responses");
});
