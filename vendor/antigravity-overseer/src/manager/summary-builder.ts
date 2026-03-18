import type { Alert, Conversation, SupervisoryAction, Task } from "../types/domain.ts";
import type { SnapshotRecord } from "../types/evidence.ts";
import type { TaskEvent } from "../types/events.ts";

export function buildTaskSummary(input: {
  task: Task;
  conversations: Conversation[];
  events: TaskEvent[];
  alerts: Alert[];
  actions: SupervisoryAction[];
  snapshots: SnapshotRecord[];
}): {
  state: Task["state"];
  summary: string;
  primaryConversationTitle: string | null;
  latestEventType: string | null;
  openAlertCount: number;
  latestSnapshotState: string | null;
  latestSnapshotExcerpt: string | null;
} {
  const lastEvent = input.events.at(-1);
  const lastAction = input.actions.at(0);
  const openAlerts = input.alerts.filter((alert) => alert.status === "open");
  const primaryConversation = input.conversations[0] ?? null;
  const latestSnapshot = input.snapshots[0] ?? null;
  const latestSnapshotExcerpt = latestSnapshot
    ? latestSnapshot.extractedText.split("\n").slice(0, 3).join(" ").slice(0, 220)
    : null;

  return {
    state: input.task.state,
    primaryConversationTitle: primaryConversation?.title ?? null,
    latestEventType: lastEvent?.type ?? null,
    openAlertCount: openAlerts.length,
    latestSnapshotState: latestSnapshot?.uiState ?? null,
    latestSnapshotExcerpt,
    summary: [
      `Task "${input.task.title}" is currently ${input.task.state}.`,
      primaryConversation ? `Primary conversation: ${primaryConversation.title}.` : "No linked conversation.",
      lastEvent ? `Latest event: ${lastEvent.type}.` : "No events recorded yet.",
      lastAction ? `Latest supervisory action: ${lastAction.actionType}.` : "No supervisory action recorded.",
      openAlerts.length > 0 ? `${openAlerts.length} open alert(s).` : "No open alerts.",
      latestSnapshot ? `Latest visible UI state: ${latestSnapshot.uiState}.` : "No evidence snapshots yet."
    ].join(" ")
  };
}
