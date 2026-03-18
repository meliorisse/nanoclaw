import { createRuntimeContext } from "./services/runtime.ts";
import { syncVisibleState } from "./services/visible-sync.ts";
import { buildOperationalReport } from "./services/operational-report.ts";

const runtime = await createRuntimeContext();
const sync = await syncVisibleState({
  adapter: runtime.adapter,
  repositories: {
    projects: runtime.repositories.projects,
    conversations: runtime.repositories.conversations,
    tasks: runtime.repositories.tasks,
    taskEvents: runtime.repositories.taskEvents
  }
});
const overview = await runtime.adapter.getScreenOverview();
const report = await buildOperationalReport({
  config: runtime.config,
  sync,
  activeConversationRef: overview.data.activeConversationRef,
  tasksRepository: runtime.repositories.tasks,
  conversationsRepository: runtime.repositories.conversations,
  alertsRepository: runtime.repositories.alerts
});

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
