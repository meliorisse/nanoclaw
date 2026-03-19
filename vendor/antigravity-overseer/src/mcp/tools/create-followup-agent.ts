import type { OverseerAdapter } from "../../adapter/core/adapter.ts";
import { AgentsRepository } from "../../db/repositories/agents.ts";
import { ConversationsRepository } from "../../db/repositories/conversations.ts";
import { ProjectsRepository } from "../../db/repositories/projects.ts";
import { SupervisoryActionsRepository } from "../../db/repositories/supervisory-actions.ts";
import { TaskEventsRepository } from "../../db/repositories/task-events.ts";
import type { TasksRepository } from "../../db/repositories/tasks.ts";

export async function createFollowupAgentTool(
  adapter: OverseerAdapter,
  projectsRepository: ProjectsRepository,
  conversationsRepository: ConversationsRepository,
  tasksRepository: TasksRepository,
  taskEventsRepository: TaskEventsRepository,
  agentsRepository: AgentsRepository,
  supervisoryActionsRepository: SupervisoryActionsRepository,
  input: {
    projectId: string;
    brief: string;
    parentTaskId?: string;
  }
) {
  const project = projectsRepository.getById(input.projectId);

  if (!project) {
    return {
      ok: false,
      data: null,
      confidence: 0,
      evidence: [],
      warnings: [`Unknown project: ${input.projectId}`]
    };
  }

  const result = await adapter.createFollowupAgent({
    projectRef: project.externalProjectRef,
    brief: input.brief,
    parentTaskId: input.parentTaskId
  });

  if (!result.data.created || !result.data.conversationRef) {
    return result;
  }

  const conversation = conversationsRepository.upsert({
    projectId: project.id,
    externalConversationRef: result.data.conversationRef,
    title: result.data.conversationTitle ?? "Follow-up Agent",
    status: "idle"
  });

  agentsRepository.create({
    conversationId: conversation.id,
    role: "followup",
    status: "created"
  });

  supervisoryActionsRepository.create({
    taskId: input.parentTaskId ?? null,
    conversationId: conversation.id,
    actionType: "create_followup_agent",
    instructionText: input.brief,
    result: result.data.message
  });

  if (input.parentTaskId) {
    taskEventsRepository.create({
      taskId: input.parentTaskId,
      type: "followup_agent_created",
      source: "mcp",
      payload: {
        conversationId: conversation.id,
        conversationRef: conversation.externalConversationRef,
        brief: input.brief
      }
    });
  } else {
    tasksRepository.ensureForConversation({
      projectId: project.id,
      conversationId: conversation.id,
      title: conversation.title,
      objective: input.brief
    });
  }

  return {
    ...result,
    data: {
      ...result.data,
      conversationId: conversation.id
    }
  };
}
