import { AlertsRepository } from "../../db/repositories/alerts.ts";

export async function acknowledgeAlertTool(alertsRepository: AlertsRepository, alertId: string) {
  const alert = alertsRepository.acknowledge(alertId);

  return {
    ok: Boolean(alert),
    data: alert ?? null,
    confidence: alert ? 1 : 0,
    evidence: [],
    warnings: alert ? [] : [`Unknown alert: ${alertId}`]
  };
}
