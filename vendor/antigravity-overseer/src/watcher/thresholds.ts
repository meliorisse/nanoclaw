import type { AppConfig } from "../config/defaults.ts";

export interface WatcherThresholds {
  stalledAfterSeconds: number;
  completionCandidateConfidence: number;
  uiDriftConfidenceThreshold: number;
}

export function getWatcherThresholds(config: AppConfig): WatcherThresholds {
  return {
    stalledAfterSeconds: config.thresholds.stalledAfterSeconds,
    completionCandidateConfidence: config.thresholds.completionCandidateConfidence,
    uiDriftConfidenceThreshold: config.thresholds.uiDriftConfidenceThreshold
  };
}
