import type { OverseerAdapter } from "../../adapter/core/adapter.ts";
import { ConversationsRepository } from "../../db/repositories/conversations.ts";
import { ProjectsRepository } from "../../db/repositories/projects.ts";
import { resolveConversationIdentifier } from "../resolvers.ts";

export async function sendMessageTool(
  adapter: OverseerAdapter,
  conversationsRepository: ConversationsRepository,
  projectsRepository: ProjectsRepository,
  input: { conversationId: string; text: string }
) {
  const conversation = resolveConversationIdentifier(conversationsRepository, input.conversationId);

  if (!conversation) {
    return {
      ok: false,
      data: null,
      confidence: 0,
      evidence: [],
      warnings: [`Unknown conversation: ${input.conversationId}`]
    };
  }

  const project = projectsRepository.getById(conversation.projectId);
  return adapter.sendMessage({
    conversationRef: conversation.externalConversationRef,
    conversationTitle: conversation.title,
    projectRef: project?.externalProjectRef ?? conversation.externalConversationRef.split(":")[0] ?? null,
    projectTitle: project?.name ?? null,
    text: input.text
  });
}
