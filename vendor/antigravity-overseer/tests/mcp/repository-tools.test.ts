import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRuntimeContext } from "../../src/services/runtime.ts";
import { syncVisibleState } from "../../src/services/visible-sync.ts";
import { listProjectsTool } from "../../src/mcp/tools/list-projects.ts";
import { listConversationsTool } from "../../src/mcp/tools/list-conversations.ts";
import { getConversationTool } from "../../src/mcp/tools/get-conversation.ts";
import { getStatusTool } from "../../src/mcp/tools/get-status.ts";
import { getScreenOverviewTool } from "../../src/mcp/tools/get-screen-overview.ts";

const fixture = `
Start new conversation
Chat History
Workspaces
TGE
Pushing Code Changes 13d
Campaign UI Bug Fixing 14d
Fixing Guild Raid Bug 15d
Campaign Node Refactor 15d
See all (27)
nanoclaw
Fixing Host Mode Responses... now
Playground
No chats yet
Agent Manager
nanoclaw / Fixing Host Mode Responses
requests time out after 3 minutes of waiting. it's not quite enough. can you set timeout to 10 minutes instead?
Thought for 3s
Two places to update - the credential proxy HTTP timeout (3 min) and the host agent inactivity timeout (5 min). Bumping both:
Edited credential-proxy.ts +3 -3
Edited container-runner.ts +2 -1
Ran command
tsc
Done - built and restarted.
`;

test("repository-backed MCP tools return stable workspace and conversation records", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ag-overseer-mcp-test-"));
  const visibleTextPath = path.join(root, "visible.txt");
  await writeFile(visibleTextPath, fixture, "utf8");

  process.env.OVERSEER_DB_PATH = path.join(root, "overseer.sqlite");
  process.env.OVERSEER_EVIDENCE_DIR = path.join(root, "evidence");
  process.env.OVERSEER_LOGS_DIR = path.join(root, "logs");
  process.env.OVERSEER_PROFILE_PATH = path.join(root, "profile");
  process.env.OVERSEER_VISIBLE_TEXT_PATH = visibleTextPath;

  const runtime = await createRuntimeContext();
  const sync = await syncVisibleState(runtime);
  const visibleProjectIds = sync.projects.map((project) => project.id);

  const projectsResult = await listProjectsTool(runtime.repositories.projects, visibleProjectIds);
  assert.deepEqual(
    projectsResult.data.map((project) => project.externalProjectRef).sort(),
    ["nanoclaw", "tge"]
  );

  const nanoclawProject = sync.projects.find((project) => project.externalProjectRef === "nanoclaw");
  assert.ok(nanoclawProject);

  const conversationsResult = await listConversationsTool(
    runtime.repositories.projects,
    runtime.repositories.conversations,
    nanoclawProject!.id
  );
  assert.equal(conversationsResult.data.length, 1);

  const conversation = conversationsResult.data[0]!;
  const conversationDetail = await getConversationTool(
    runtime.adapter,
    runtime.repositories.conversations,
    conversation.id
  );
  assert.equal(conversationDetail.data.conversationId, conversation.id);
  assert.equal(conversationDetail.data.title, "Fixing Host Mode Responses");
  assert.equal(conversationDetail.data.status, "active");
  assert.equal(conversationDetail.data.messages[0]?.role, "user");
  assert.match(conversationDetail.data.messages[0]?.text ?? "", /timeout to 10 minutes/i);

  const statusResult = await getStatusTool(
    runtime.adapter,
    runtime.repositories.conversations,
    conversation.externalConversationRef
  );
  assert.equal(statusResult.data.status, "active");

  const screenOverview = await getScreenOverviewTool(
    runtime.adapter,
    runtime.repositories.projects,
    runtime.repositories.conversations
  );
  assert.equal(screenOverview.data.activeConversationRef, "nanoclaw:fixing-host-mode-responses");
  assert.equal(screenOverview.data.activeConversationTitle, "Fixing Host Mode Responses");
  assert.ok(
    screenOverview.data.projects.some(
      (project) =>
        project.projectRef === "tge" &&
        project.conversations.some((conversation) => conversation.title === "Campaign Node Refactor")
    )
  );
});
