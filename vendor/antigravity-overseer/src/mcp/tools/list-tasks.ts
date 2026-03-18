import { TasksRepository } from "../../db/repositories/tasks.ts";

export async function listTasksTool(
  tasksRepository: TasksRepository,
  projectId?: string,
  visibleProjectIds?: string[]
) {
  const tasks = tasksRepository.list(projectId);
  const filteredTasks =
    projectId || !visibleProjectIds ? tasks : tasks.filter((task) => visibleProjectIds.includes(task.projectId));

  return {
    ok: true,
    data: filteredTasks,
    confidence: 1,
    evidence: [],
    warnings: []
  };
}
