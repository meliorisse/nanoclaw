import type { Conversation, ConversationStatus } from "../../types/domain.ts";
import { createId } from "../../utils/ids.ts";
import { nowIso } from "../../utils/time.ts";
import type { DatabaseClient } from "../client.ts";

interface ConversationRow {
  id: string;
  project_id: string;
  external_conversation_ref: string;
  title: string;
  status: ConversationStatus;
  last_message_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

function mapConversationRow(row: ConversationRow | undefined): Conversation | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    externalConversationRef: row.external_conversation_ref,
    title: row.title,
    status: row.status,
    lastMessageAt: row.last_message_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ConversationsRepository {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  upsert(input: {
    projectId: string;
    externalConversationRef: string;
    title: string;
    status: ConversationStatus;
    lastMessageAt?: string | null;
  }): Conversation {
    const timestamp = nowIso();
    this.client
      .prepare(
        `INSERT INTO conversations (
          id, project_id, external_conversation_ref, title, status, last_message_at, last_seen_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(external_conversation_ref) DO UPDATE SET
          project_id = excluded.project_id,
          title = excluded.title,
          status = excluded.status,
          last_message_at = excluded.last_message_at,
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at`
      )
      .run(
        createId("conv"),
        input.projectId,
        input.externalConversationRef,
        input.title,
        input.status,
        input.lastMessageAt ?? null,
        timestamp,
        timestamp,
        timestamp
      );

    return this.getByExternalRef(input.externalConversationRef)!;
  }

  listByProject(projectId: string): Conversation[] {
    return (this.client
      .prepare("SELECT * FROM conversations WHERE project_id = ? ORDER BY last_seen_at DESC")
      .all(projectId) as ConversationRow[]).map((row) => mapConversationRow(row)!);
  }

  list(): Conversation[] {
    return (this.client
      .prepare("SELECT * FROM conversations ORDER BY last_seen_at DESC")
      .all() as ConversationRow[]).map((row) => mapConversationRow(row)!);
  }

  getById(id: string): Conversation | undefined {
    return mapConversationRow(
      this.client.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined
    );
  }

  getByExternalRef(externalConversationRef: string): Conversation | undefined {
    return mapConversationRow(
      this.client
        .prepare("SELECT * FROM conversations WHERE external_conversation_ref = ?")
        .get(externalConversationRef) as ConversationRow | undefined
    );
  }
}
