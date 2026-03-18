import type { EventSource, TaskEvent, TaskEventType } from "../../types/events.ts";
import { createId } from "../../utils/ids.ts";
import { nowIso } from "../../utils/time.ts";
import type { DatabaseClient } from "../client.ts";

interface TaskEventRow {
  id: string;
  task_id: string;
  type: TaskEventType;
  source: EventSource;
  payload_json: string;
  created_at: string;
}

function mapTaskEventRow(row: TaskEventRow): TaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type,
    source: row.source,
    payloadJson: row.payload_json,
    createdAt: row.created_at
  };
}

export class TaskEventsRepository {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  create(input: { taskId: string; type: TaskEventType; source: EventSource; payload: unknown }): TaskEvent {
    const event: TaskEvent = {
      id: createId("event"),
      taskId: input.taskId,
      type: input.type,
      source: input.source,
      payloadJson: JSON.stringify(input.payload),
      createdAt: nowIso()
    };

    this.client
      .prepare(
        `INSERT INTO task_events (id, task_id, type, source, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(event.id, event.taskId, event.type, event.source, event.payloadJson, event.createdAt);

    return event;
  }

  listForTask(taskId: string): TaskEvent[] {
    return (this.client
      .prepare("SELECT * FROM task_events WHERE task_id = ? ORDER BY created_at ASC")
      .all(taskId) as TaskEventRow[]).map((row) => mapTaskEventRow(row));
  }
}
