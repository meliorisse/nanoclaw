import { TaskEventsRepository } from "../../db/repositories/task-events.ts";
import { TasksRepository } from "../../db/repositories/tasks.ts";

export async function requestVerificationTool(
  tasksRepository: TasksRepository,
  taskEventsRepository: TaskEventsRepository,
  input: { taskId: string; rubric?: string }
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

  const updated = tasksRepository.updateState(task.id, "verification_running");
  taskEventsRepository.create({
    taskId: task.id,
    type: "verification_requested",
    source: "mcp",
    payload: {
      rubric: input.rubric ?? null
    }
  });

  return {
    ok: true,
    data: updated,
    confidence: 0.8,
    evidence: [],
    warnings: []
  };
}
