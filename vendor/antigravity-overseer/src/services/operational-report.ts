import type { Alert, AlertSeverity, Task, TaskState } from "../types/domain.ts";
import type { ConversationsRepository } from "../db/repositories/conversations.ts";
import type { AlertsRepository } from "../db/repositories/alerts.ts";
import type { TasksRepository } from "../db/repositories/tasks.ts";
import type { AppConfig } from "../config/defaults.ts";
import type { SyncVisibleStateResult } from "./visible-sync.ts";
import { buildHealthReport, type HealthReport } from "./health.ts";
import { nowIso } from "../utils/time.ts";

const attentionStates = new Set<TaskState>(["stalled", "needs_review", "retrying", "failed"]);

interface RunbookReference {
  title: string;
  slug: string;
  filePath: "./docs/runbooks.md";
}

const runbooksByAlertKind: Record<string, RunbookReference> = {
  stalled: {
    title: "Runbook: stalled worker",
    slug: "runbook-stalled-worker",
    filePath: "./docs/runbooks.md"
  },
  needs_review: {
    title: "Runbook: likely hallucinated completion",
    slug: "runbook-likely-hallucinated-completion",
    filePath: "./docs/runbooks.md"
  },
  ui_drift: {
    title: "Runbook: UI drift detected",
    slug: "runbook-ui-drift-detected",
    filePath: "./docs/runbooks.md"
  },
  app_unavailable: {
    title: "Runbook: app/session unavailable",
    slug: "runbook-app-session-unavailable",
    filePath: "./docs/runbooks.md"
  },
  send_message_failed: {
    title: "Runbook: send message failure",
    slug: "runbook-send-message-failure",
    filePath: "./docs/runbooks.md"
  },
  verifier_disagreement: {
    title: "Runbook: verifier disagreement",
    slug: "runbook-verifier-disagreement",
    filePath: "./docs/runbooks.md"
  },
  evidence_degraded: {
    title: "Runbook: evidence storage degraded",
    slug: "runbook-evidence-storage-degraded",
    filePath: "./docs/runbooks.md"
  }
};

export interface OperationalReport {
  ok: boolean;
  generatedAt: string;
  health: HealthReport;
  tasks: {
    visibleTotal: number;
    ledgerTotal: number;
    visibleByState: Partial<Record<TaskState, number>>;
    needsAttentionCount: number;
    needsAttention: Array<{
      taskId: string;
      title: string;
      state: TaskState;
      conversationRef: string | null;
    }>;
  };
  alerts: {
    openCount: number;
    acknowledgedCount: number;
    bySeverity: Partial<Record<AlertSeverity, number>>;
    open: Array<{
      alertId: string;
      severity: AlertSeverity;
      kind: string;
      summary: string;
      taskId: string | null;
      runbook: RunbookReference | null;
    }>;
  };
  warnings: string[];
}

function countTasksByState(tasks: Task[]): Partial<Record<TaskState, number>> {
  const counts: Partial<Record<TaskState, number>> = {};

  for (const task of tasks) {
    counts[task.state] = (counts[task.state] ?? 0) + 1;
  }

  return counts;
}

function countAlertsBySeverity(alerts: Alert[]): Partial<Record<AlertSeverity, number>> {
  const counts: Partial<Record<AlertSeverity, number>> = {};

  for (const alert of alerts) {
    counts[alert.severity] = (counts[alert.severity] ?? 0) + 1;
  }

  return counts;
}

export async function buildOperationalReport(input: {
  config: AppConfig;
  sync: SyncVisibleStateResult;
  activeConversationRef: string | null;
  tasksRepository: TasksRepository;
  conversationsRepository: ConversationsRepository;
  alertsRepository: AlertsRepository;
}): Promise<OperationalReport> {
  const health = await buildHealthReport(input.config, input.sync, input.activeConversationRef);
  const tasks = input.tasksRepository.list();
  const visibleTasks = input.sync.tasks
    .map((task) => input.tasksRepository.getById(task.id) ?? task)
    .filter((task) => Boolean(task));
  const openAlerts = input.alertsRepository.list("open");
  const acknowledgedAlerts = input.alertsRepository.list("acknowledged");
  const warnings = [...health.warnings];
  const needsAttention = tasks
    .filter((task) => attentionStates.has(task.state))
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      state: task.state,
      conversationRef: task.primaryConversationId
        ? input.conversationsRepository.getById(task.primaryConversationId)?.externalConversationRef ?? null
        : null
    }));

  if (openAlerts.length > 0) {
    warnings.push(`${openAlerts.length} open alert(s) require review.`);
  }

  if (needsAttention.length > 0) {
    warnings.push(`${needsAttention.length} task(s) are in attention states.`);
  }

  if (tasks.length > visibleTasks.length) {
    warnings.push(
      `Ledger contains ${tasks.length - visibleTasks.length} task(s) that are not on the current visible screen.`
    );
  }

  return {
    ok: health.ok && openAlerts.length === 0 && needsAttention.length === 0,
    generatedAt: nowIso(),
    health,
    tasks: {
      visibleTotal: visibleTasks.length,
      ledgerTotal: tasks.length,
      visibleByState: countTasksByState(visibleTasks),
      needsAttentionCount: needsAttention.length,
      needsAttention
    },
    alerts: {
      openCount: openAlerts.length,
      acknowledgedCount: acknowledgedAlerts.length,
      bySeverity: countAlertsBySeverity(openAlerts),
      open: openAlerts.map((alert) => ({
        alertId: alert.id,
        severity: alert.severity,
        kind: alert.kind,
        summary: alert.summary,
        taskId: alert.taskId,
        runbook: runbooksByAlertKind[alert.kind] ?? null
      }))
    },
    warnings
  };
}
