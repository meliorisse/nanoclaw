import test from "node:test";
import assert from "node:assert/strict";
import { parseVisibleWindowFixture } from "../../src/adapter/parsing/window-fixture-parser.ts";

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

test("window fixture parser extracts workspaces and conversations from agent manager text", () => {
  const parsed = parseVisibleWindowFixture(fixture);
  assert.deepEqual(
    parsed.projects.map((project) => project.projectName),
    ["TGE", "nanoclaw"]
  );
  assert.deepEqual(
    parsed.conversations
      .filter((conversation) => conversation.projectRef === "tge")
      .map((conversation) => conversation.conversationTitle),
    [
      "Pushing Code Changes",
      "Campaign UI Bug Fixing",
      "Fixing Guild Raid Bug",
      "Campaign Node Refactor"
    ]
  );
  const activeConversation = parsed.conversations.find(
    (conversation) => conversation.conversationRef === "nanoclaw:fixing-host-mode-responses"
  );
  assert.ok(activeConversation);
  assert.equal(activeConversation?.status, "active");
  assert.equal(activeConversation?.messages[0]?.role, "user");
  assert.match(activeConversation?.messages[0]?.text ?? "", /timeout to 10 minutes/i);
});

const liveCollectorFixture = `
Agent Manager
Open Editor
+ Start new conversation
nanoclaw / Fixing Host Mode Responses
• Chat History
Workspaces
› Thought for 22s
TGE v
Responses are flowing through now. Two issues visible in the screenshot:
• Pushing Code Changes
13d
1. API Error: Claude's response exceeded the 32000 output token maximum - the
• Campaign Ul Bug Fixing
14d
claude binary has an internal output limit check. Setting CLAUDE_CODE_MAX_OUTPUT_TOKENS
Fixing Guild Raid Bug
15d
2. Host agent timeout - 15 min timed out at the end of a long task. That's expected.
in the agent env will fix this.
Campaign Node Refactor
15d
See all (27)
Fixing Output Token Limit Error
Added CLAUDE_CODE_MAX_OUTPUT_TOKENS=4000 to agentEnv. Built and restarted
nanoclaw v
nanoclaw (PID 47591). The SDK's internal 32000-token limit check will now be aligned with
Fixing Host Mode Respon... now
the 4000 token cap enforced by the credential proxy.
Files Edited
Playground O
Ts container-runner.ts
No chats yet
Progress Updates
Expand all ‹
token limit error
Built and restarted (PID 47591). Added CLAUDE_CODE_MAX_OUTPUT_TOKENS=4000 to the
Copy
Ask anything, @ to mention, / for workflows
• Provide Feedback
`;

test("window fixture parser ignores interleaved main-pane text from live collector output", () => {
  const parsed = parseVisibleWindowFixture(liveCollectorFixture);

  assert.deepEqual(
    parsed.projects.map((project) => project.projectName),
    ["TGE", "nanoclaw"]
  );

  assert.deepEqual(
    parsed.conversations
      .filter((conversation) => conversation.projectRef === "tge")
      .map((conversation) => conversation.conversationTitle),
    [
      "Pushing Code Changes",
      "Campaign UI Bug Fixing",
      "Fixing Guild Raid Bug",
      "Campaign Node Refactor"
    ]
  );

  const activeConversation = parsed.conversations.find(
    (conversation) => conversation.conversationRef === "nanoclaw:fixing-host-mode-responses"
  );

  assert.ok(activeConversation);
  assert.equal(activeConversation?.status, "active");
  assert.deepEqual(
    parsed.conversations
      .filter((conversation) => conversation.projectRef === "nanoclaw")
      .map((conversation) => conversation.conversationTitle),
    ["Fixing Host Mode Responses"]
  );
  assert.equal(parsed.warnings.length, 0);
});
