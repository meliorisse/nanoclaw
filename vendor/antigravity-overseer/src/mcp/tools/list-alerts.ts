import type { AlertStatus } from "../../types/domain.ts";
import { AlertsRepository } from "../../db/repositories/alerts.ts";

export async function listAlertsTool(alertsRepository: AlertsRepository, status?: AlertStatus) {
  return {
    ok: true,
    data: alertsRepository.list(status),
    confidence: 1,
    evidence: [],
    warnings: []
  };
}
