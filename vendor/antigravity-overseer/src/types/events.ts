import type { TaskState } from "./domain.ts";

export type EventSource =
  | "watcher"
  | "adapter"
  | "manager"
  | "mcp"
  | "system";

export type TaskEventType =
  | "task_created"
  | "conversation_refreshed"
  | "progress_detected"
  | "stalled_detected"
  | "completion_candidate_detected"
  | "verification_requested"
  | "state_transitioned"
  | "alert_opened"
  | "supervisory_message_sent"
  | "followup_agent_created"
  | "write_failed"
  | "system_health_changed";

export interface TaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  source: EventSource;
  payloadJson: string;
  createdAt: string;
}

export interface StateTransitionRecord {
  taskId: string;
  fromState: TaskState;
  toState: TaskState;
  reason: string;
  confidence: number;
}
