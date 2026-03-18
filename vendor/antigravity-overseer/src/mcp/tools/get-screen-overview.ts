import type { OverseerAdapter } from "../../adapter/core/adapter.ts";
import { ConversationsRepository } from "../../db/repositories/conversations.ts";
import { ProjectsRepository } from "../../db/repositories/projects.ts";

export async function getScreenOverviewTool(
  adapter: OverseerAdapter,
  projectsRepository: ProjectsRepository,
  conversationsRepository: ConversationsRepository
) {
  const result = await adapter.getScreenOverview();

  return {
    ...result,
    data: {
      ...result.data,
      projects: result.data.projects.map((project) => {
        const resolvedProject = projectsRepository.getByExternalRef(project.projectRef);

        return {
          ...project,
          projectId: resolvedProject?.id ?? null,
          conversations: project.conversations.map((conversation) => {
            const resolvedConversation = conversationsRepository.getByExternalRef(conversation.conversationRef);

            return {
              ...conversation,
              conversationId: resolvedConversation?.id ?? null
            };
          })
        };
      }),
      activeConversationId: result.data.activeConversationRef
        ? conversationsRepository.getByExternalRef(result.data.activeConversationRef)?.id ?? null
        : null
    }
  };
}
