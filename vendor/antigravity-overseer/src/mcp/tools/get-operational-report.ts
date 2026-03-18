import type { AppConfig } from "../../config/defaults.ts";
import { AlertsRepository } from "../../db/repositories/alerts.ts";
import { ConversationsRepository } from "../../db/repositories/conversations.ts";
import { TasksRepository } from "../../db/repositories/tasks.ts";
import { buildOperationalReport } from "../../services/operational-report.ts";
import type { SyncVisibleStateResult } from "../../services/visible-sync.ts";

export async function getOperationalReportTool(
  config: AppConfig,
  sync: SyncVisibleStateResult,
  activeConversationRef: string | null,
  tasksRepository: TasksRepository,
  conversationsRepository: ConversationsRepository,
  alertsRepository: AlertsRepository
) {
  const report = await buildOperationalReport({
    config,
    sync,
    activeConversationRef,
    tasksRepository,
    conversationsRepository,
    alertsRepository
  });

  return {
    ok: report.ok,
    data: report,
    confidence: report.ok ? 0.95 : 0.7,
    evidence: [],
    warnings: report.warnings
  };
}
