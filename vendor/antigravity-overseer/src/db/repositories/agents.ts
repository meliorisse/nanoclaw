import type { Agent, AgentRole } from "../../types/domain.ts";
import { createId } from "../../utils/ids.ts";
import { nowIso } from "../../utils/time.ts";
import type { DatabaseClient } from "../client.ts";

interface AgentRow {
  id: string;
  conversation_id: string;
  role: AgentRole;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapAgentRow(row: AgentRow): Agent {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class AgentsRepository {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  create(input: { conversationId: string; role: AgentRole; status: string }): Agent {
    const agent: Agent = {
      id: createId("agent"),
      conversationId: input.conversationId,
      role: input.role,
      status: input.status,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    this.client
      .prepare(
        `INSERT INTO agents (id, conversation_id, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(agent.id, agent.conversationId, agent.role, agent.status, agent.createdAt, agent.updatedAt);

    return mapAgentRow({
      id: agent.id,
      conversation_id: agent.conversationId,
      role: agent.role,
      status: agent.status,
      created_at: agent.createdAt,
      updated_at: agent.updatedAt
    });
  }
}
