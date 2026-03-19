import type { ConversationMessage, ConversationStatus } from "../../types/domain.ts";
import { createId } from "../../utils/ids.ts";
import type { ExtensionBridgePayload } from "../../bridge/receiver.ts";
import type {
  VisibleConversationFixture,
  VisibleProjectFixture,
  VisibleWindowFixture
} from "./window-fixture-parser.ts";
import { parseVisibleWindowFixture } from "./window-fixture-parser.ts";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStatus(isActive: boolean): ConversationStatus {
  return isActive ? "active" : "idle";
}

function stripNanoClawOutputContract(content: string): string {
  const marker = "NanoClaw output contract (required):";
  const markerIndex = content.indexOf(marker);
  if (markerIndex === -1) {
    return content.trim();
  }

  return content.slice(0, markerIndex).trim();
}

function toMessages(
  messages: ExtensionBridgePayload["messages"] | undefined
): ConversationMessage[] {
  return (messages ?? [])
    .filter(
      (message) =>
        message &&
        typeof message.role === "string" &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .map((message) => ({
      id: createId("msg"),
      role:
        message.role === "user" ||
        message.role === "assistant" ||
        message.role === "system" ||
        message.role === "supervisor"
          ? message.role
          : "unknown",
      text:
        message.role === "user"
          ? stripNanoClawOutputContract(message.content)
          : message.content.trim(),
      createdAt: null
    }))
    .filter((message) => message.text.length > 0);
}

function parseMetadataProjects(
  payload: ExtensionBridgePayload
): VisibleProjectFixture[] {
  const workspaces = Array.isArray(payload.metadata?.workspaces)
    ? payload.metadata.workspaces
    : [];

  return workspaces.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const workspace = entry as Record<string, unknown>;
    if (typeof workspace.title !== "string" || !workspace.title.trim()) {
      return [];
    }

    return [
      {
        projectName: workspace.title.trim(),
        projectRef: slugify(workspace.title)
      }
    ];
  });
}

export function parseBridgeSnapshotPayload(
  payload: ExtensionBridgePayload
): VisibleWindowFixture {
  const warnings: string[] = [];
  const metadataProjects = parseMetadataProjects(payload);
  const hasStructuredWorkspaces = metadataProjects.length > 0;
  const visibleTextFallback =
    typeof payload.visibleText === "string" && payload.visibleText.trim()
      ? parseVisibleWindowFixture(payload.visibleText)
      : {
          projects: [],
          conversations: [],
          activeConversationRef: null,
          warnings: []
        };

  const projectsMap = new Map<string, VisibleProjectFixture>();
  for (const project of hasStructuredWorkspaces ? metadataProjects : visibleTextFallback.projects) {
    projectsMap.set(project.projectRef, project);
  }

  const conversations: VisibleConversationFixture[] = [];
  const workspaces = Array.isArray(payload.metadata?.workspaces)
    ? payload.metadata.workspaces
    : [];

  for (const entry of workspaces) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const workspace = entry as Record<string, unknown>;
    const projectName = typeof workspace.title === "string" ? workspace.title.trim() : "";
    if (!projectName) {
      continue;
    }

    const projectRef = slugify(projectName);
    projectsMap.set(projectRef, {
      projectName,
      projectRef
    });

    const workspaceConversations = Array.isArray(workspace.conversations)
      ? workspace.conversations
      : [];

    for (const conversationEntry of workspaceConversations) {
      if (!conversationEntry || typeof conversationEntry !== "object") {
        continue;
      }

      const conversation = conversationEntry as Record<string, unknown>;
      const conversationTitle =
        typeof conversation.title === "string" ? conversation.title.trim() : "";
      if (!conversationTitle) {
        continue;
      }

      const conversationRef =
        typeof payload.conversationRef === "string" &&
        payload.threadTitle === conversationTitle
          ? payload.conversationRef
          : `${projectRef}:${slugify(conversationTitle)}`;
      const isActive = Boolean(conversation.isActive);
      conversations.push({
        projectName,
        projectRef,
        conversationTitle,
        conversationRef,
        status: normalizeStatus(isActive),
        lastMessageAt: null,
        messages:
          typeof payload.threadTitle === "string" &&
          payload.threadTitle === conversationTitle
            ? toMessages(payload.messages)
            : []
      });
    }
  }

  if (
    typeof payload.workspaceRef === "string" &&
    typeof payload.threadTitle === "string" &&
    !conversations.some(
      (conversation) => conversation.conversationRef === payload.conversationRef
    )
  ) {
    const projectRef = payload.workspaceRef;
    const projectName =
      payload.metadata?.activeWorkspace && typeof payload.metadata.activeWorkspace === "string"
        ? payload.metadata.activeWorkspace
        : projectRef;
    projectsMap.set(projectRef, {
      projectName,
      projectRef
    });
    conversations.push({
      projectName,
      projectRef,
      conversationTitle: payload.threadTitle,
      conversationRef:
        payload.conversationRef ?? `${projectRef}:${slugify(payload.threadTitle)}`,
      status: "active",
      lastMessageAt: null,
      messages: toMessages(payload.messages)
    });
  }

  if (conversations.length === 0) {
    return {
      projects: [...projectsMap.values(), ...visibleTextFallback.projects].filter(
        (project, index, items) =>
          items.findIndex((candidate) => candidate.projectRef === project.projectRef) === index
      ),
      conversations: visibleTextFallback.conversations,
      activeConversationRef: visibleTextFallback.activeConversationRef,
      warnings: [
        ...warnings,
        ...visibleTextFallback.warnings,
        "Bridge snapshot did not include structured workspaces; fell back to visible text parsing."
      ]
    };
  }

  const activeConversationRef =
    conversations.find((conversation) => conversation.status === "active")?.conversationRef ??
    payload.conversationRef ??
    null;

  return {
    projects: [...projectsMap.values()],
    conversations,
    activeConversationRef,
    warnings
  };
}
