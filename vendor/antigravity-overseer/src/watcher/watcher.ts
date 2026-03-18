import { classifyObservation } from "./classifier.ts";
import { determineWatcherState } from "./rules.ts";
import { getWatcherThresholds } from "./thresholds.ts";
import { Scheduler } from "./scheduler.ts";
import { MacOSWindowUIAdapter } from "../adapter/macos-ui/adapter.ts";
import { transitionTaskState } from "../manager/state-machine.ts";
import { createRuntimeContext, type RuntimeContext } from "../services/runtime.ts";
import { syncVisibleState } from "../services/visible-sync.ts";
import type { AlertsRepository } from "../db/repositories/alerts.ts";
import type { ConversationsRepository } from "../db/repositories/conversations.ts";
import type { ProjectsRepository } from "../db/repositories/projects.ts";
import type { TaskEventsRepository } from "../db/repositories/task-events.ts";
import type { TasksRepository } from "../db/repositories/tasks.ts";
import type { Logger } from "../utils/logger.ts";

export class OverseerWatcher {
  private readonly adapter: MacOSWindowUIAdapter;
  private readonly projectsRepository: ProjectsRepository;
  private readonly tasksRepository: TasksRepository;
  private readonly conversationsRepository: ConversationsRepository;
  private readonly taskEventsRepository: TaskEventsRepository;
  private readonly alertsRepository: AlertsRepository;
  private readonly logger: Logger;
  private readonly config: { thresholds: ReturnType<typeof getWatcherThresholds> };

  constructor(
    adapter: MacOSWindowUIAdapter,
    projectsRepository: ProjectsRepository,
    tasksRepository: TasksRepository,
    conversationsRepository: ConversationsRepository,
    taskEventsRepository: TaskEventsRepository,
    alertsRepository: AlertsRepository,
    logger: Logger,
    config: { thresholds: ReturnType<typeof getWatcherThresholds> }
  ) {
    this.adapter = adapter;
    this.projectsRepository = projectsRepository;
    this.tasksRepository = tasksRepository;
    this.conversationsRepository = conversationsRepository;
    this.taskEventsRepository = taskEventsRepository;
    this.alertsRepository = alertsRepository;
    this.logger = logger;
    this.config = config;
  }

  async poll(): Promise<void> {
    const sync = await syncVisibleState({
      adapter: this.adapter,
      repositories: {
        projects: this.projectsRepository,
        conversations: this.conversationsRepository,
        tasks: this.tasksRepository,
        taskEvents: this.taskEventsRepository
      }
    });

    for (const warning of sync.warnings) {
      this.logger.warn("Visible-state sync warning", { warning });
    }

    const tasks = sync.tasks;

    for (const task of tasks) {
      const conversation = task.primaryConversationId
        ? this.conversationsRepository.getById(task.primaryConversationId)
        : undefined;

      if (!conversation) {
        continue;
      }

      const statusResult = await this.adapter.getStatus(conversation.externalConversationRef);
      const conversationResult = await this.adapter.getConversation(conversation.externalConversationRef);
      const classification = classifyObservation({
        visibleText: conversationResult.data.messages.map((message) => message.text).join("\n\n"),
        status: statusResult.data.status,
        confidence: Math.min(statusResult.confidence, conversationResult.confidence),
        lastMeaningfulProgressAt: task.updatedAt,
        stalledAfterSeconds: this.config.thresholds.stalledAfterSeconds,
        completionCandidateConfidence: this.config.thresholds.completionCandidateConfidence
      });

      const nextState = determineWatcherState(task.state, classification);

      if (nextState !== task.state) {
        const transition = transitionTaskState({
          taskId: task.id,
          fromState: task.state,
          toState: nextState,
          reason: classification.reason,
          confidence: classification.confidence
        });

        this.tasksRepository.updateState(task.id, transition.toState);
        this.taskEventsRepository.create({
          taskId: task.id,
          type: "state_transitioned",
          source: "watcher",
          payload: transition
        });

        if (nextState === "needs_review" || nextState === "stalled") {
          this.alertsRepository.createOnce({
            taskId: task.id,
            severity: nextState === "stalled" ? "warning" : "high",
            kind: nextState,
            summary: classification.reason
          });
        }

        this.logger.info("Watcher updated task state", {
          taskId: task.id,
          fromState: task.state,
          toState: nextState
        });
      }
    }
  }
}

function createWatcher(runtime: RuntimeContext): OverseerWatcher {
  return new OverseerWatcher(
    runtime.adapter,
    runtime.repositories.projects,
    runtime.repositories.tasks,
    runtime.repositories.conversations,
    runtime.repositories.taskEvents,
    runtime.repositories.alerts,
    runtime.logger,
    { thresholds: getWatcherThresholds(runtime.config) }
  );
}

async function main(): Promise<void> {
  const runtime = await createRuntimeContext();
  const watcher = createWatcher(runtime);
  const once = process.argv.includes("--once");

  await watcher.poll();

  if (once) {
    runtime.logger.info("Watcher completed single poll");
    return;
  }

  const scheduler = new Scheduler();
  scheduler.start(runtime.config.polling.activeConversationRefreshSeconds * 1000, async () => {
    await watcher.poll();
  });

  runtime.logger.info("Watcher started", {
    intervalSeconds: runtime.config.polling.activeConversationRefreshSeconds
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
