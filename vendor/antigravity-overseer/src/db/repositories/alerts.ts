import type { Alert, AlertSeverity, AlertStatus } from "../../types/domain.ts";
import { createId } from "../../utils/ids.ts";
import { nowIso } from "../../utils/time.ts";
import type { DatabaseClient } from "../client.ts";

interface AlertRow {
  id: string;
  task_id: string | null;
  severity: AlertSeverity;
  kind: string;
  status: AlertStatus;
  summary: string;
  created_at: string;
  resolved_at: string | null;
}

function mapAlertRow(row: AlertRow | undefined): Alert | undefined {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    taskId: row.task_id,
    severity: row.severity,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  };
}

export class AlertsRepository {
  private readonly client: DatabaseClient;

  constructor(client: DatabaseClient) {
    this.client = client;
  }

  create(input: {
    taskId?: string | null;
    severity: AlertSeverity;
    kind: string;
    summary: string;
  }): Alert {
    const alert: Alert = {
      id: createId("alert"),
      taskId: input.taskId ?? null,
      severity: input.severity,
      kind: input.kind,
      status: "open",
      summary: input.summary,
      createdAt: nowIso(),
      resolvedAt: null
    };

    this.client
      .prepare(
        `INSERT INTO alerts (id, task_id, severity, kind, status, summary, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        alert.id,
        alert.taskId,
        alert.severity,
        alert.kind,
        alert.status,
        alert.summary,
        alert.createdAt,
        alert.resolvedAt
      );

    return alert;
  }

  list(status?: AlertStatus): Alert[] {
    if (status) {
      return (this.client
        .prepare("SELECT * FROM alerts WHERE status = ? ORDER BY created_at DESC")
        .all(status) as AlertRow[]).map((row) => mapAlertRow(row)!);
    }

    return (this.client
      .prepare("SELECT * FROM alerts ORDER BY created_at DESC")
      .all() as AlertRow[]).map((row) => mapAlertRow(row)!);
  }

  findOpenByTaskAndKind(taskId: string | null, kind: string): Alert | undefined {
    return mapAlertRow(
      this.client
        .prepare(
          `SELECT * FROM alerts
           WHERE status = 'open'
             AND kind = ?
             AND ((task_id IS NULL AND ? IS NULL) OR task_id = ?)
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(kind, taskId, taskId) as AlertRow | undefined
    );
  }

  createOnce(input: {
    taskId?: string | null;
    severity: AlertSeverity;
    kind: string;
    summary: string;
  }): Alert {
    const existing = this.findOpenByTaskAndKind(input.taskId ?? null, input.kind);
    if (existing) {
      return existing;
    }

    return this.create(input);
  }

  acknowledge(id: string): Alert | undefined {
    this.client
      .prepare("UPDATE alerts SET status = ? WHERE id = ?")
      .run("acknowledged", id);

    return mapAlertRow(
      this.client.prepare("SELECT * FROM alerts WHERE id = ?").get(id) as AlertRow | undefined
    );
  }
}
