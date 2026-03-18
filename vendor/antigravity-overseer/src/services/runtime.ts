import { MacOSWindowUIAdapter } from "../adapter/macos-ui/adapter.ts";
import { loadConfig } from "../config/config.ts";
import type { AppConfig } from "../config/defaults.ts";
import { applySchema, openDatabase, type DatabaseClient } from "../db/client.ts";
import { AgentsRepository } from "../db/repositories/agents.ts";
import { AlertsRepository } from "../db/repositories/alerts.ts";
import { ConversationsRepository } from "../db/repositories/conversations.ts";
import { ProjectsRepository } from "../db/repositories/projects.ts";
import { SnapshotsRepository } from "../db/repositories/snapshots.ts";
import { SupervisoryActionsRepository } from "../db/repositories/supervisory-actions.ts";
import { TaskEventsRepository } from "../db/repositories/task-events.ts";
import { TasksRepository } from "../db/repositories/tasks.ts";
import { Logger } from "../utils/logger.ts";
import { ensureRuntimeDirs, resolveFromRoot } from "../utils/paths.ts";

export interface RuntimeContext {
  config: AppConfig;
  logger: Logger;
  db: DatabaseClient;
  adapter: MacOSWindowUIAdapter;
  repositories: {
    projects: ProjectsRepository;
    conversations: ConversationsRepository;
    tasks: TasksRepository;
    taskEvents: TaskEventsRepository;
    alerts: AlertsRepository;
    agents: AgentsRepository;
    snapshots: SnapshotsRepository;
    supervisoryActions: SupervisoryActionsRepository;
  };
}

export async function createRuntimeContext(): Promise<RuntimeContext> {
  const config = await loadConfig();
  const logger = new Logger(config.logging);

  await ensureRuntimeDirs([
    resolveFromRoot(config.evidenceDir),
    resolveFromRoot(config.logsDir),
    resolveFromRoot(config.profilePath)
  ]);

  const db = openDatabase(resolveFromRoot(config.dbPath));
  applySchema(db);

  const adapter = new MacOSWindowUIAdapter(config, db, logger);
  await adapter.attach();

  return {
    config,
    logger,
    db,
    adapter,
    repositories: {
      projects: new ProjectsRepository(db),
      conversations: new ConversationsRepository(db),
      tasks: new TasksRepository(db),
      taskEvents: new TaskEventsRepository(db),
      alerts: new AlertsRepository(db),
      agents: new AgentsRepository(db),
      snapshots: new SnapshotsRepository(db),
      supervisoryActions: new SupervisoryActionsRepository(db)
    }
  };
}
