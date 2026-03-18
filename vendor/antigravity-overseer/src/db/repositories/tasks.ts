import type { Task, TaskPriority, TaskState } from "../../types/domain.ts";
import { createId } from "../../utils/ids.ts";
import { nowIso } from "../../utils/time.ts";
import type { DatabaseClient } from "../client.ts";

interface TaskRow {
  id: string;
  project_id: string;
  primary_conversation_id: string | null;
  title: string;
  objective: string;
  state: TaskState;
  priority: TaskPriority;
  created_at: string;
  updated_at: string;
}

function mapTaskRow(row: TaskRow | undefined): Task | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    primaryConversationId: row.primary_conversation_id,
    title: row.title,
    objective: row.objective,
    state: row.state,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class TasksRepository {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  create(input: {
    projectId: string;
    primaryConversationId?: string | null;
    title: string;
    objective: string;
    state?: TaskState;
    priority?: TaskPriority;
  }): Task {
    const id = createId("task");
    const timestamp = nowIso();
    this.client
      .prepare(
        `INSERT INTO tasks (
          id, project_id, primary_conversation_id, title, objective, state, priority, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.projectId,
        input.primaryConversationId ?? null,
        input.title,
        input.objective,
        input.state ?? "new",
        input.priority ?? "medium",
        timestamp,
        timestamp
      );

    return this.getById(id)!;
  }

  list(projectId?: string): Task[] {
    if (projectId) {
      return (this.client
        .prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY updated_at DESC")
        .all(projectId) as TaskRow[]).map((row) => mapTaskRow(row)!);
    }

    return (this.client
      .prepare("SELECT * FROM tasks ORDER BY updated_at DESC")
      .all() as TaskRow[]).map((row) => mapTaskRow(row)!);
  }

  getById(id: string): Task | undefined {
    return mapTaskRow(this.client.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined);
  }

  getByConversationId(conversationId: string): Task | undefined {
    return mapTaskRow(
      this.client
        .prepare("SELECT * FROM tasks WHERE primary_conversation_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(conversationId) as TaskRow | undefined
    );
  }

  ensureForConversation(input: {
    projectId: string;
    conversationId: string;
    title: string;
    objective: string;
    priority?: TaskPriority;
  }): Task {
    const existing = this.getByConversationId(input.conversationId);

    if (existing) {
      return existing;
    }

    return this.create({
      projectId: input.projectId,
      primaryConversationId: input.conversationId,
      title: input.title,
      objective: input.objective,
      state: "assigned",
      priority: input.priority
    });
  }

  updateState(id: string, state: TaskState): Task | undefined {
    const timestamp = nowIso();
    this.client
      .prepare("UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?")
      .run(state, timestamp, id);

    return this.getById(id);
  }
}
