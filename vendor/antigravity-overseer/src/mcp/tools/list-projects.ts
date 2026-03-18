import { ProjectsRepository } from "../../db/repositories/projects.ts";

export async function listProjectsTool(
  projectsRepository: ProjectsRepository,
  visibleProjectIds?: string[]
) {
  const projects = projectsRepository.list();
  const visibleProjects = visibleProjectIds
    ? projects.filter((project) => visibleProjectIds.includes(project.id))
    : projects;

  return {
    ok: true,
    data: visibleProjects,
    confidence: 0.95,
    evidence: [],
    warnings: []
  };
}
