import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRuntimeContext } from "../../src/services/runtime.ts";
import { syncVisibleState } from "../../src/services/visible-sync.ts";

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
`;

test("visible sync persists projects, conversations, and tasks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ag-overseer-test-"));
  const visibleTextPath = path.join(root, "visible.txt");
  await writeFile(visibleTextPath, fixture, "utf8");

  process.env.OVERSEER_DB_PATH = path.join(root, "overseer.sqlite");
  process.env.OVERSEER_EVIDENCE_DIR = path.join(root, "evidence");
  process.env.OVERSEER_LOGS_DIR = path.join(root, "logs");
  process.env.OVERSEER_PROFILE_PATH = path.join(root, "profile");
  process.env.OVERSEER_VISIBLE_TEXT_PATH = visibleTextPath;

  const runtime = await createRuntimeContext();
  const result = await syncVisibleState(runtime);

  assert.equal(result.projects.length, 2);
  assert.equal(result.conversations.length, 5);
  assert.equal(result.tasks.length, 5);
  assert.deepEqual(
    runtime.repositories.projects.list().map((project) => project.name).sort(),
    ["TGE", "nanoclaw"]
  );
  assert.ok(
    runtime.repositories
      .conversations
      .list()
      .some((conversation) => conversation.externalConversationRef === "nanoclaw:fixing-host-mode-responses")
  );
  assert.equal(runtime.repositories.tasks.list().length, 5);
  const activeConversation = runtime.repositories.conversations
    .list()
    .find((conversation) => conversation.externalConversationRef === "nanoclaw:fixing-host-mode-responses");
  assert.ok(activeConversation);
  assert.ok(runtime.repositories.snapshots.listForConversation(activeConversation!.id).length >= 1);
  const activeTask = runtime.repositories.tasks.getByConversationId(activeConversation!.id);
  assert.ok(activeTask);
  assert.ok(
    runtime.repositories.taskEvents
      .listForTask(activeTask!.id)
      .some((event) => event.type === "conversation_refreshed")
  );
});
