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
  for (const project of metadataProjects) {
    projectsMap.set(project.projectRef, project);
  }

  const resolvedActiveProjectRef =
    (typeof payload.workspaceRef === "string" ? payload.workspaceRef : null) ??
    (visibleTextFallback.activeConversationRef
      ? visibleTextFallback.conversations.find(
          (conversation) =>
            conversation.conversationRef === visibleTextFallback.activeConversationRef
        )?.projectRef ?? null
      : null);
  const resolvedActiveProjectName =
    (typeof payload.metadata?.activeWorkspace === "string"
      ? payload.metadata.activeWorkspace
      : null) ??
    (visibleTextFallback.activeConversationRef
      ? visibleTextFallback.conversations.find(
          (conversation) =>
            conversation.conversationRef === visibleTextFallback.activeConversationRef
        )?.projectName ?? null
      : null) ??
    resolvedActiveProjectRef;
  const resolvedActiveConversationRef =
    (typeof payload.conversationRef === "string" ? payload.conversationRef : null) ??
    visibleTextFallback.activeConversationRef ??
    null;
  const resolvedActiveConversationTitle =
    (typeof payload.threadTitle === "string" ? payload.threadTitle : null) ??
    (visibleTextFallback.activeConversationRef
      ? visibleTextFallback.conversations.find(
          (conversation) =>
            conversation.conversationRef === visibleTextFallback.activeConversationRef
        )?.conversationTitle ?? null
      : null);

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
    resolvedActiveProjectRef &&
    resolvedActiveConversationTitle &&
    !conversations.some(
      (conversation) => conversation.conversationRef === resolvedActiveConversationRef
    )
  ) {
    const projectRef = resolvedActiveProjectRef;
    const projectName = resolvedActiveProjectName ?? projectRef;
    projectsMap.set(projectRef, {
      projectName,
      projectRef
    });
    conversations.push({
      projectName,
      projectRef,
      conversationTitle: resolvedActiveConversationTitle,
      conversationRef:
        resolvedActiveConversationRef ?? `${projectRef}:${slugify(resolvedActiveConversationTitle)}`,
      status: "active",
      lastMessageAt: null,
      messages: toMessages(payload.messages)
    });
  }

  if (conversations.length === 0) {
    const fallbackOnlyActiveConversation =
      resolvedActiveProjectRef && resolvedActiveConversationTitle
      ? [
          {
            projectName: resolvedActiveProjectName ?? resolvedActiveProjectRef,
            projectRef: resolvedActiveProjectRef,
            conversationTitle: resolvedActiveConversationTitle,
            conversationRef:
              resolvedActiveConversationRef ??
              `${resolvedActiveProjectRef}:${slugify(resolvedActiveConversationTitle)}`,
            status: "active" as const,
            lastMessageAt: null,
            messages: toMessages(payload.messages)
          }
        ]
      : [];
    const fallbackOnlyProjects = resolvedActiveProjectRef
      ? [
          {
            projectName: resolvedActiveProjectName ?? resolvedActiveProjectRef,
            projectRef: resolvedActiveProjectRef
          }
        ]
      : visibleTextFallback.projects;

    return {
      projects: [...projectsMap.values(), ...fallbackOnlyProjects].filter(
        (project, index, items) =>
          items.findIndex((candidate) => candidate.projectRef === project.projectRef) === index
      ),
      conversations: fallbackOnlyActiveConversation,
      activeConversationRef:
        fallbackOnlyActiveConversation[0]?.conversationRef ?? null,
      warnings: [
        ...warnings,
        ...visibleTextFallback.warnings,
        "Bridge snapshot did not include structured workspaces; fell back to visible text parsing."
      ]
    };
  }

  const activeConversationRef =
    conversations.find((conversation) => conversation.status === "active")?.conversationRef ??
    resolvedActiveConversationRef ??
    null;

  return {
    projects: [...projectsMap.values()],
    conversations,
    activeConversationRef,
    warnings
  };
}
