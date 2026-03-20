import type { OverseerAdapter } from "../../adapter/core/adapter.ts";
import { ConversationsRepository } from "../../db/repositories/conversations.ts";
import { ProjectsRepository } from "../../db/repositories/projects.ts";
import { resolveConversationIdentifier } from "../resolvers.ts";

export async function getConversationTool(
  adapter: OverseerAdapter,
  conversationsRepository: ConversationsRepository,
  projectsRepository: ProjectsRepository,
  conversationIdentifier: string
) {
  const conversation = resolveConversationIdentifier(conversationsRepository, conversationIdentifier);

  if (!conversation) {
    return {
      ok: false,
      data: null,
      confidence: 0,
      evidence: [],
      warnings: [`Unknown conversation: ${conversationIdentifier}`]
    };
  }

  const project = projectsRepository.getById(conversation.projectId);
  const result = await adapter.getConversation(conversation.externalConversationRef, {
    conversationTitle: conversation.title,
    projectRef: project?.externalProjectRef ?? conversation.externalConversationRef.split(":")[0] ?? null,
    projectTitle: project?.name ?? null
  });
  return {
    ...result,
    data: {
      ...result.data,
      conversationId: conversation.id
    }
  };
}
