export type TaskState =
  | "new"
  | "assigned"
  | "running"
  | "awaiting_response"
  | "stalled"
  | "retrying"
  | "needs_review"
  | "verification_running"
  | "completed_candidate"
  | "completed_verified"
  | "failed"
  | "abandoned";

export type TaskPriority = "low" | "medium" | "high" | "critical";
export type ConversationStatus = "active" | "idle" | "loading" | "completed" | "unknown";
export type AlertSeverity = "info" | "warning" | "high" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type AgentRole = "primary" | "verifier" | "followup" | "supervisor";
export type SupervisoryActionType =
  | "send_message"
  | "retry"
  | "verify"
  | "escalate"
  | "create_followup_agent";

export interface Project {
  id: string;
  externalProjectRef: string;
  name: string;
  lastSeenAt: string;
  metadataJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  projectId: string;
  externalConversationRef: string;
  title: string;
  status: ConversationStatus;
  lastMessageAt: string | null;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  primaryConversationId: string | null;
  title: string;
  objective: string;
  state: TaskState;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  conversationId: string;
  role: AgentRole;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  taskId: string | null;
  severity: AlertSeverity;
  kind: string;
  status: AlertStatus;
  summary: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface SupervisoryAction {
  id: string;
  taskId: string | null;
  conversationId: string | null;
  actionType: SupervisoryActionType;
  instructionText: string;
  result: string;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "system" | "user" | "assistant" | "supervisor" | "unknown";
  text: string;
  createdAt: string | null;
}
