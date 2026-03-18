import { SnapshotsRepository } from "../../db/repositories/snapshots.ts";
import { SupervisoryActionsRepository } from "../../db/repositories/supervisory-actions.ts";
import { TaskEventsRepository } from "../../db/repositories/task-events.ts";
import { TasksRepository } from "../../db/repositories/tasks.ts";

export async function getTaskTimelineTool(
  tasksRepository: TasksRepository,
  taskEventsRepository: TaskEventsRepository,
  snapshotsRepository: SnapshotsRepository,
  supervisoryActionsRepository: SupervisoryActionsRepository,
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

  return {
    ok: true,
    data: {
      task,
      events: taskEventsRepository.listForTask(taskId).map((event) => ({
        ...event,
        payload: JSON.parse(event.payloadJson)
      })),
      snapshots: task.primaryConversationId
        ? snapshotsRepository.listForConversation(task.primaryConversationId)
        : [],
      actions: supervisoryActionsRepository.listForTask(taskId)
    },
    confidence: 0.9,
    evidence: [],
    warnings: []
  };
}
