import type { AppConfig } from "../../config/defaults.ts";
import { buildHealthReport } from "../../services/health.ts";
import type { SyncVisibleStateResult } from "../../services/visible-sync.ts";

export async function getHealthTool(
  config: AppConfig,
  sync: SyncVisibleStateResult,
  activeConversationRef: string | null
) {
  const report = await buildHealthReport(config, sync, activeConversationRef);

  return {
    ok: report.ok,
    data: report,
    confidence: report.ok ? 0.95 : 0.6,
    evidence: [],
    warnings: report.warnings
  };
}
