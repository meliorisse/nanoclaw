import { AlertsRepository } from "../../db/repositories/alerts.ts";
import { ConversationsRepository } from "../../db/repositories/conversations.ts";
import { SnapshotsRepository } from "../../db/repositories/snapshots.ts";
import { SupervisoryActionsRepository } from "../../db/repositories/supervisory-actions.ts";
import { TaskEventsRepository } from "../../db/repositories/task-events.ts";
import { TasksRepository } from "../../db/repositories/tasks.ts";
import { buildTaskSummary } from "../../manager/summary-builder.ts";

export async function getTaskSummaryTool(
  tasksRepository: TasksRepository,
  conversationsRepository: ConversationsRepository,
  taskEventsRepository: TaskEventsRepository,
  alertsRepository: AlertsRepository,
  supervisoryActionsRepository: SupervisoryActionsRepository,
  snapshotsRepository: SnapshotsRepository,
  taskId: string
) {
  const task = tasksRepository.getById(taskId);

  if (!task) {
    return {
      ok: false,
      data: null,
      confidence: 0,
      evidence: [],
      warnings: [`Unknown task: ${taskId}`]
    };
  }

  const conversations = task.primaryConversationId
    ? [conversationsRepository.getById(task.primaryConversationId)].filter(Boolean)
    : [];

  const summary = buildTaskSummary({
    task,
    conversations,
    events: taskEventsRepository.listForTask(task.id),
    alerts: alertsRepository.list().filter((alert) => alert.taskId === task.id),
    actions: supervisoryActionsRepository.listForTask(task.id),
    snapshots: task.primaryConversationId
      ? snapshotsRepository.listForConversation(task.primaryConversationId)
      : []
  });
  const latestSnapshot = task.primaryConversationId
    ? snapshotsRepository.listForConversation(task.primaryConversationId)[0]
    : undefined;

  return {
    ok: true,
    data: summary,
    confidence: 0.85,
    evidence: latestSnapshot
      ? [{ snapshotId: latestSnapshot.id, filePath: latestSnapshot.screenshotPath ?? undefined }]
      : [],
    warnings: []
  };
}
