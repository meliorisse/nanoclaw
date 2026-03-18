import { ConversationsRepository } from "../db/repositories/conversations.ts";
import { ProjectsRepository } from "../db/repositories/projects.ts";

export function resolveProjectIdentifier(
  projectsRepository: ProjectsRepository,
  identifier: string
) {
  return projectsRepository.getById(identifier) ?? projectsRepository.getByExternalRef(identifier);
}

export function resolveConversationIdentifier(
  conversationsRepository: ConversationsRepository,
  identifier: string
) {
  return conversationsRepository.getById(identifier) ?? conversationsRepository.getByExternalRef(identifier);
}
