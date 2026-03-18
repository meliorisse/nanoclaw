import type { Conversation, Project, Task } from "../types/domain.ts";
import type { OverseerAdapter } from "../adapter/core/adapter.ts";
import type { ProjectsRepository } from "../db/repositories/projects.ts";
import type { ConversationsRepository } from "../db/repositories/conversations.ts";
import type { TasksRepository } from "../db/repositories/tasks.ts";
import type { TaskEventsRepository } from "../db/repositories/task-events.ts";

export interface VisibleSyncContext {
  adapter: OverseerAdapter;
  repositories: {
    projects: ProjectsRepository;
    conversations: ConversationsRepository;
    tasks: TasksRepository;
    taskEvents: TaskEventsRepository;
  };
}

export interface SyncVisibleStateResult {
  projects: Project[];
  conversations: Conversation[];
  tasks: Task[];
  warnings: string[];
}

export async function syncVisibleState(context: VisibleSyncContext): Promise<SyncVisibleStateResult> {
  const overviewResult = await context.adapter.getScreenOverview();
  const warnings = [...overviewResult.warnings];
  const syncedProjects: Project[] = [];
  const syncedConversations: Conversation[] = [];
  const syncedTasks: Task[] = [];

  for (const visibleProject of overviewResult.data.projects) {
    const project = context.repositories.projects.upsertByExternalRef({
      externalProjectRef: visibleProject.projectRef,
      name: visibleProject.name
    });

    syncedProjects.push(project);

    for (const visibleConversation of visibleProject.conversations) {
      const conversation = context.repositories.conversations.upsert({
        projectId: project.id,
        externalConversationRef: visibleConversation.conversationRef,
        title: visibleConversation.title,
        status: visibleConversation.status,
        lastMessageAt: null
      });

      syncedConversations.push(conversation);

      const existingTask = context.repositories.tasks.getByConversationId(conversation.id);
      const task = context.repositories.tasks.ensureForConversation({
        projectId: project.id,
        conversationId: conversation.id,
        title: conversation.title,
        objective: `Supervise conversation "${conversation.title}" via the exposed macOS window UI.`
      });

      if (!existingTask) {
        context.repositories.taskEvents.create({
          taskId: task.id,
          type: "task_created",
          source: "watcher",
          payload: {
            projectId: project.id,
            conversationId: conversation.id,
            conversationRef: conversation.externalConversationRef
          }
        });
      }

      syncedTasks.push(task);
    }
  }

  if (overviewResult.data.activeConversationRef) {
    const activeConversation = syncedConversations.find(
      (conversation) => conversation.externalConversationRef === overviewResult.data.activeConversationRef
    );

    if (activeConversation) {
      const activeTask = syncedTasks.find((task) => task.primaryConversationId === activeConversation.id) ?? null;
      const activeProject = syncedProjects.find((project) => project.id === activeConversation.projectId) ?? null;
      const evidence = await context.adapter.captureEvidence({
        projectId: activeProject?.id ?? null,
        conversationId: activeConversation.id,
        taskId: activeTask?.id ?? null
      });

      if (activeTask) {
        context.repositories.taskEvents.create({
          taskId: activeTask.id,
          type: "conversation_refreshed",
          source: "watcher",
          payload: {
            conversationId: activeConversation.id,
            conversationRef: activeConversation.externalConversationRef,
            snapshotId: evidence.snapshot.id,
            uiState: evidence.snapshot.uiState,
            confidence: evidence.snapshot.confidence
          }
        });
      }
    }
  }

  return {
    projects: syncedProjects,
    conversations: syncedConversations,
    tasks: syncedTasks,
    warnings
  };
}
