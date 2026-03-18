import type { SupervisoryAction, SupervisoryActionType } from "../../types/domain.ts";
import { createId } from "../../utils/ids.ts";
import { nowIso } from "../../utils/time.ts";
import type { DatabaseClient } from "../client.ts";

interface SupervisoryActionRow {
  id: string;
  task_id: string | null;
  conversation_id: string | null;
  action_type: SupervisoryActionType;
  instruction_text: string;
  result: string;
  created_at: string;
}

function mapSupervisoryActionRow(row: SupervisoryActionRow): SupervisoryAction {
  return {
    id: row.id,
    taskId: row.task_id,
    conversationId: row.conversation_id,
    actionType: row.action_type,
    instructionText: row.instruction_text,
    result: row.result,
    createdAt: row.created_at
  };
}

export class SupervisoryActionsRepository {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  create(input: {
    taskId?: string | null;
    conversationId?: string | null;
    actionType: SupervisoryActionType;
    instructionText: string;
    result: string;
  }): SupervisoryAction {
    const action: SupervisoryAction = {
      id: createId("action"),
      taskId: input.taskId ?? null,
      conversationId: input.conversationId ?? null,
      actionType: input.actionType,
      instructionText: input.instructionText,
      result: input.result,
      createdAt: nowIso()
    };

    this.client
      .prepare(
        `INSERT INTO supervisory_actions (
          id, task_id, conversation_id, action_type, instruction_text, result, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        action.id,
        action.taskId,
        action.conversationId,
        action.actionType,
        action.instructionText,
        action.result,
        action.createdAt
      );

    return action;
  }

  listForTask(taskId: string): SupervisoryAction[] {
    return (this.client
      .prepare("SELECT * FROM supervisory_actions WHERE task_id = ? ORDER BY created_at DESC")
      .all(taskId) as SupervisoryActionRow[]).map((row) => mapSupervisoryActionRow(row));
  }
}
