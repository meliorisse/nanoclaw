import { SupervisoryActionsRepository } from "../../db/repositories/supervisory-actions.ts";
import { TaskEventsRepository } from "../../db/repositories/task-events.ts";
import { TasksRepository } from "../../db/repositories/tasks.ts";

export async function retryTaskTool(
  tasksRepository: TasksRepository,
  taskEventsRepository: TaskEventsRepository,
  supervisoryActionsRepository: SupervisoryActionsRepository,
  input: { taskId: string; instruction?: string }
) {
  const task = tasksRepository.getById(input.taskId);

  if (!task) {
    return {
      ok: false,
      data: null,
      confidence: 0,
      evidence: [],
      warnings: [`Unknown task: ${input.taskId}`]
    };
  }

  const updated = tasksRepository.updateState(input.taskId, "retrying");
  taskEventsRepository.create({
    taskId: input.taskId,
    type: "state_transitioned",
    source: "mcp",
    payload: {
      fromState: task.state,
      toState: "retrying",
      reason: "Retry requested via MCP"
    }
  });

  supervisoryActionsRepository.create({
    taskId: task.id,
    conversationId: task.primaryConversationId,
    actionType: "retry",
    instructionText: input.instruction ?? "Retry the task from the last successful step.",
    result: "queued"
  });

  return {
    ok: true,
    data: updated,
    confidence: 0.78,
    evidence: [],
    warnings: []
  };
}
