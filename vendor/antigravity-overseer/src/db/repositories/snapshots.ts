import type { SnapshotRecord } from "../../types/evidence.ts";
import { createId } from "../../utils/ids.ts";
import { nowIso } from "../../utils/time.ts";
import type { DatabaseClient } from "../client.ts";

interface SnapshotRow {
  id: string;
  project_id: string | null;
  conversation_id: string | null;
  task_id: string | null;
  screenshot_path: string | null;
  extracted_text: string;
  ui_state: string;
  confidence: number;
  created_at: string;
}

function mapSnapshotRow(row: SnapshotRow): SnapshotRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    taskId: row.task_id,
    screenshotPath: row.screenshot_path,
    extractedText: row.extracted_text,
    uiState: row.ui_state,
    confidence: row.confidence,
    createdAt: row.created_at
  };
}

export class SnapshotsRepository {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  create(input: Omit<SnapshotRecord, "id" | "createdAt">): SnapshotRecord {
    const snapshot: SnapshotRecord = {
      id: createId("snap"),
      ...input,
      createdAt: nowIso()
    };

    this.client
      .prepare(
        `INSERT INTO snapshots (
          id, project_id, conversation_id, task_id, screenshot_path, extracted_text, ui_state, confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        snapshot.id,
        snapshot.projectId,
        snapshot.conversationId,
        snapshot.taskId,
        snapshot.screenshotPath,
        snapshot.extractedText,
        snapshot.uiState,
        snapshot.confidence,
        snapshot.createdAt
      );

    return snapshot;
  }

  listForConversation(conversationId: string): SnapshotRecord[] {
    return (this.client
      .prepare("SELECT * FROM snapshots WHERE conversation_id = ? ORDER BY created_at DESC")
      .all(conversationId) as SnapshotRow[]).map((row) => mapSnapshotRow(row));
  }

  listForTask(taskId: string): SnapshotRecord[] {
    return (this.client
      .prepare("SELECT * FROM snapshots WHERE task_id = ? ORDER BY created_at DESC")
      .all(taskId) as SnapshotRow[]).map((row) => mapSnapshotRow(row));
  }
}
