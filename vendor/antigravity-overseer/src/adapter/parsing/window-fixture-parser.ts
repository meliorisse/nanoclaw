import type { ConversationMessage, ConversationStatus } from "../../types/domain.ts";
import { createId } from "../../utils/ids.ts";
import { normalizeVisibleText } from "./normalization.ts";
import { parseStatusFromVisibleText } from "./status-parser.ts";

export interface VisibleConversationFixture {
  projectName: string;
  projectRef: string;
  conversationTitle: string;
  conversationRef: string;
  status: ConversationStatus;
  lastMessageAt: string | null;
  messages: ConversationMessage[];
}

export interface VisibleProjectFixture {
  projectName: string;
  projectRef: string;
}

export interface VisibleWindowFixture {
  projects: VisibleProjectFixture[];
  conversations: VisibleConversationFixture[];
  activeConversationRef: string | null;
  warnings: string[];
}

const STOP_SIDEBAR_LINES = new Set([
  "Playground",
  "Knowledge",
  "Browser",
  "Settings",
  "Provide Feedback",
  "Agent Manager"
]);

const IGNORED_SIDEBAR_LINES = new Set([
  "Start new conversation",
  "Chat History",
  "Workspaces",
  "No chats yet",
  "Open Editor"
]);

const MAIN_PANE_NOISE_PATTERNS = [
  /^Thought for /i,
  /^Files Edited$/i,
  /^Progress Updates$/i,
  /^Expand all/i,
  /^Copy$/i,
  /^Ask anything/i,
  /^Edited /i,
  /^Ran command$/i,
  /^Always run/i,
  /^Exit code /i,
  /^Added /i,
  /^Built and restarted/i,
  /^Ts /i,
  /^\d+[.)]/,
  /^Planning\b/i,
  /^Claude\b/i
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseStatus(value: string | undefined, fallbackText: string): ConversationStatus {
  if (!value) {
    return parseStatusFromVisibleText(fallbackText).status;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "active" ||
    normalized === "idle" ||
    normalized === "loading" ||
    normalized === "completed" ||
    normalized === "unknown"
  ) {
    return normalized;
  }

  return parseStatusFromVisibleText(`${value}\n${fallbackText}`).status;
}

function parseMessageLines(lines: string[]): ConversationMessage[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(system|user|assistant|supervisor):\s*(.*)$/i);

      if (match) {
        return {
          id: createId("msg"),
          role: match[1].toLowerCase() as ConversationMessage["role"],
          text: match[2].trim(),
          createdAt: null
        };
      }

      return {
        id: createId("msg"),
        role: "unknown",
        text: line,
        createdAt: null
      };
    });
}

function addConversation(
  conversations: VisibleConversationFixture[],
  input: {
    projectName: string;
    projectRef: string;
    conversationTitle: string;
    conversationRef?: string;
    status?: ConversationStatus;
    lastMessageAt?: string | null;
    messages?: ConversationMessage[];
  }
): void {
  const conversationRef =
    input.conversationRef ?? `${input.projectRef}:${slugify(input.conversationTitle) || "conversation"}`;
  const existing = conversations.find((conversation) => conversation.conversationRef === conversationRef);
  const canonicalInputTitle = canonicalConversationTitle(input.conversationTitle);
  const fuzzyMatch = conversations.find((conversation) => {
    if (conversation.projectRef !== input.projectRef) {
      return false;
    }

    const canonicalExistingTitle = canonicalConversationTitle(conversation.conversationTitle);
    return (
      canonicalExistingTitle === canonicalInputTitle ||
      canonicalExistingTitle.startsWith(canonicalInputTitle) ||
      canonicalInputTitle.startsWith(canonicalExistingTitle)
    );
  });

  const target = existing ?? fuzzyMatch;

  if (target) {
    if (
      scoreConversationTitle(input.conversationTitle, input.status) >=
      scoreConversationTitle(target.conversationTitle, target.status)
    ) {
      target.conversationTitle = input.conversationTitle;
    }
    if (
      input.status === "active" ||
      conversationRef.length > target.conversationRef.length
    ) {
      target.conversationRef = conversationRef;
    }
    target.status = input.status ?? target.status;
    target.lastMessageAt = input.lastMessageAt ?? target.lastMessageAt;
    target.messages = input.messages && input.messages.length > 0 ? input.messages : target.messages;
    return;
  }

  conversations.push({
    projectName: input.projectName,
    projectRef: input.projectRef,
    conversationTitle: input.conversationTitle,
    conversationRef,
    status: input.status ?? "idle",
    lastMessageAt: input.lastMessageAt ?? null,
    messages: input.messages ?? []
  });
}

function canonicalConversationTitle(value: string): string {
  return stripRecencySuffix(value).toLowerCase().replace(/\.{3,}/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreConversationTitle(
  title: string,
  status?: ConversationStatus
): number {
  return (
    canonicalConversationTitle(title).length +
    (title.includes("...") ? 0 : 100) +
    (status === "active" ? 50 : 0)
  );
}

function stripRecencySuffix(line: string): string {
  return normalizeSidebarLabel(line)
    .replace(/\s+(?:\d+[smhdw]|now)$/i, "")
    .replace(/\s+[vV]$/, "")
    .trim();
}

function normalizeSidebarLabel(line: string): string {
  return line
    .trim()
    .replace(/^[•◦▪‣›+]+\s*/u, "")
    .replace(/[|‹›^]+$/u, "")
    .replace(/\bUl\b/g, "UI")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSidebarLabel(input: string, labels: Set<string>): boolean {
  const normalized = normalizeSidebarLabel(input);

  for (const label of labels) {
    if (normalized === label || normalized.startsWith(`${label} `)) {
      return true;
    }
  }

  return false;
}

function isRecencyLine(line: string): boolean {
  return /^(?:\d+[smhdw]|now)$/i.test(normalizeSidebarLabel(line));
}

function looksLikeCompactSidebarLabel(line: string): boolean {
  const normalized = stripRecencySuffix(line);

  if (!normalized || normalized.length > 48) {
    return false;
  }

  if (/[.:!?]/.test(normalized)) {
    return false;
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9()'/_ -]*$/.test(normalized)) {
    return false;
  }

  return normalized.split(/\s+/).length <= 6;
}

function isMainPaneNoise(line: string): boolean {
  const normalized = normalizeSidebarLabel(line);

  if (!normalized) {
    return false;
  }

  if (normalized.length > 72) {
    return true;
  }

  return MAIN_PANE_NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeConversationLine(line: string, nextLine?: string): boolean {
  const normalized = normalizeSidebarLabel(line);

  if (normalized.length === 0) {
    return false;
  }

  if (normalized.startsWith("See all")) {
    return false;
  }

  if (isMainPaneNoise(normalized)) {
    return false;
  }

  if (/^[•◦▪‣]/u.test(line.trim())) {
    return true;
  }

  if (/(?:\d+[smhdw]|now)$/i.test(normalized) || normalized.includes("...")) {
    return true;
  }

  return nextLine ? isRecencyLine(nextLine) : false;
}

function looksLikeProjectHeading(
  line: string,
  activeProjectName: string | null,
  hasSeenProject: boolean
): boolean {
  const normalized = normalizeSidebarLabel(line);

  if (!normalized || isRecencyLine(normalized) || isMainPaneNoise(normalized)) {
    return false;
  }

  if (!looksLikeCompactSidebarLabel(normalized)) {
    return false;
  }

  if (/\s+[vV]$/i.test(normalized)) {
    return true;
  }

  if (!hasSeenProject) {
    return true;
  }

  return Boolean(activeProjectName && stripRecencySuffix(normalized).toLowerCase() === activeProjectName.toLowerCase());
}

function isTranscriptArtifactLine(line: string, nextLine?: string): boolean {
  const normalized = normalizeSidebarLabel(line);

  if (!normalized) {
    return true;
  }

  if (
    matchesSidebarLabel(normalized, STOP_SIDEBAR_LINES) ||
    matchesSidebarLabel(normalized, IGNORED_SIDEBAR_LINES)
  ) {
    return true;
  }

  if (normalized.startsWith("See all") || isRecencyLine(normalized)) {
    return true;
  }

  if (looksLikeProjectHeading(normalized, null, true)) {
    return true;
  }

  const compactConversationCandidate = looksLikeCompactSidebarLabel(stripRecencySuffix(normalized));
  if (
    compactConversationCandidate &&
    (
      /^[•◦▪‣]/u.test(line.trim()) ||
      /(?:\d+[smhdw]|now)$/i.test(normalized) ||
      Boolean(nextLine && isRecencyLine(nextLine))
    )
  ) {
    return true;
  }

  return false;
}

function parseActiveConversationMessages(lines: string[]): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  const userLines: string[] = [];
  const assistantLines: string[] = [];
  let mode: "user" | "assistant" = "user";

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]!;
    const line = rawLine.trim();
    const nextLine = lines[index + 1]?.trim();

    if (!line) {
      continue;
    }

    if (isTranscriptArtifactLine(line, nextLine)) {
      continue;
    }

    if (
      /^Thought for /i.test(line) ||
      /^Edited /i.test(line) ||
      /^Ran command$/i.test(line) ||
      /^Always run/i.test(line) ||
      /^Exit code /i.test(line) ||
      /^Copy$/i.test(line) ||
      /^Ask anything/i.test(line) ||
      /^Planning\b/i.test(line) ||
      /^Claude /i.test(line)
    ) {
      if (/^Thought for /i.test(line)) {
        mode = "assistant";
      }

      continue;
    }

    if (mode === "user") {
      userLines.push(line);
      continue;
    }

    assistantLines.push(line);
  }

  if (userLines.length > 0) {
    messages.push({
      id: createId("msg"),
      role: "user",
      text: userLines.join(" ").trim(),
      createdAt: null
    });
  }

  if (assistantLines.length > 0) {
    messages.push({
      id: createId("msg"),
      role: "assistant",
      text: assistantLines.join("\n").trim(),
      createdAt: null
    });
  }

  return messages;
}

function parseAgentManagerText(normalized: string): VisibleWindowFixture {
  const warnings: string[] = [];
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const projects = new Map<string, VisibleProjectFixture>();
  const conversations: VisibleConversationFixture[] = [];
  const workspacesIndex = lines.findIndex((line) => line === "Workspaces");
  const activeHeaderLine = lines.find((line) => /^[^/]+\/.+$/.test(line));
  const activeHeaderMatch = activeHeaderLine?.match(/^([^/]+)\/\s*(.+)$/);
  const activeProjectName = activeHeaderMatch?.[1]?.trim() ?? null;

  if (workspacesIndex === -1) {
    return {
      projects: [],
      conversations: [],
      activeConversationRef: null,
      warnings: ["No structured project or conversation blocks were detected."]
    };
  }

  let currentProject: VisibleProjectFixture | null = null;
  let hasSeenProject = false;

  for (let index = workspacesIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    const nextLine = lines[index + 1];

    if (matchesSidebarLabel(line, STOP_SIDEBAR_LINES)) {
      break;
    }

    if (matchesSidebarLabel(line, IGNORED_SIDEBAR_LINES) || normalizeSidebarLabel(line).startsWith("See all")) {
      continue;
    }

    if (looksLikeProjectHeading(line, activeProjectName, hasSeenProject)) {
      const projectName = stripRecencySuffix(line);
      const projectRef = slugify(projectName);
      currentProject = { projectName, projectRef };
      projects.set(projectRef, currentProject);
      hasSeenProject = true;
      continue;
    }

    if (isMainPaneNoise(line)) {
      continue;
    }

    if (!looksLikeConversationLine(line, nextLine)) {
      continue;
    }

    if (!currentProject) {
      warnings.push(`Skipped conversation before workspace heading: "${line}"`);
      continue;
    }

    const conversationTitle = stripRecencySuffix(line);
    addConversation(conversations, {
      projectName: currentProject.projectName,
      projectRef: currentProject.projectRef,
      conversationTitle,
      status: "idle"
    });

    if (nextLine && isRecencyLine(nextLine)) {
      index += 1;
    }
  }

  if (activeHeaderLine) {
    const match = activeHeaderLine.match(/^([^/]+)\/\s*(.+)$/);
    if (match) {
      const projectName = stripRecencySuffix(match[1]!.trim());
      const conversationTitle = stripRecencySuffix(match[2]!.trim());
      const projectRef = slugify(projectName);

      projects.set(projectRef, {
        projectName,
        projectRef
      });

      const headerIndex = lines.indexOf(activeHeaderLine);
      const messages = parseActiveConversationMessages(lines.slice(headerIndex + 1));

      addConversation(conversations, {
        projectName,
        projectRef,
        conversationTitle,
        status: "active",
        messages
      });
    }
  }

  return {
    projects: [...projects.values()],
    conversations,
    activeConversationRef:
      conversations.find((conversation) => conversation.status === "active")?.conversationRef ?? null,
    warnings
  };
}

export function parseVisibleWindowFixture(visibleText: string): VisibleWindowFixture {
  const normalized = normalizeVisibleText(visibleText);
  const warnings: string[] = [];

  if (!normalized) {
    return {
      projects: [],
      conversations: [],
      activeConversationRef: null,
      warnings: ["Visible window text was empty."]
    };
  }

  const blocks = normalized.split(/\n-{3,}\n/g).map((block) => block.trim()).filter(Boolean);
  const projects = new Map<string, VisibleProjectFixture>();
  const conversations: VisibleConversationFixture[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const metadata = new Map<string, string>();
    const messageLines: string[] = [];
    let inMessages = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) {
        continue;
      }

      if (/^messages:\s*$/i.test(line)) {
        inMessages = true;
        continue;
      }

      if (inMessages) {
        messageLines.push(line);
        continue;
      }

      const keyValue = line.match(/^([A-Za-z][A-Za-z0-9 ]+):\s*(.*)$/);
      if (keyValue) {
        metadata.set(keyValue[1].trim().toLowerCase(), keyValue[2].trim());
      }
    }

    const projectName = metadata.get("project") ?? metadata.get("project name");
    const conversationTitle = metadata.get("conversation") ?? metadata.get("conversation title");

    if (!projectName || !conversationTitle) {
      warnings.push(`Skipped block missing project or conversation metadata: "${block.split("\n")[0] ?? "unknown"}"`);
      continue;
    }

    const projectRef = metadata.get("project ref") ?? slugify(projectName);
    const conversationRef =
      metadata.get("conversation ref") ?? `${projectRef}:${slugify(conversationTitle) || "conversation"}`;
    const messages = parseMessageLines(messageLines);

    projects.set(projectRef, {
      projectName,
      projectRef
    });

    conversations.push({
      projectName,
      projectRef,
      conversationTitle,
      conversationRef,
      status: parseStatus(metadata.get("status"), block),
      lastMessageAt: metadata.get("last message at") ?? null,
      messages
    });
  }

  if (projects.size === 0 && conversations.length === 0) {
    return parseAgentManagerText(normalized);
  }

  return {
    projects: [...projects.values()],
    conversations,
    activeConversationRef:
      conversations.find((conversation) => conversation.status === "active")?.conversationRef ?? null,
    warnings
  };
}
