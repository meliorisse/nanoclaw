import { ConversationsRepository } from "../../db/repositories/conversations.ts";
import { ProjectsRepository } from "../../db/repositories/projects.ts";
import { resolveProjectIdentifier } from "../resolvers.ts";

export async function listConversationsTool(
  projectsRepository: ProjectsRepository,
  conversationsRepository: ConversationsRepository,
  projectIdentifier: string
) {
  const project = resolveProjectIdentifier(projectsRepository, projectIdentifier);

  if (!project) {
    return {
      ok: false,
      data: [],
      confidence: 0,
      evidence: [],
      warnings: [`Unknown project: ${projectIdentifier}`]
    };
  }

  return {
    ok: true,
    data: conversationsRepository.listByProject(project.id),
    confidence: 0.95,
    evidence: [],
    warnings: []
  };
}
