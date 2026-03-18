import type { LogLevel } from "../utils/logger.ts";

export interface AppConfig {
  dbPath: string;
  appName: string;
  windowTitlePattern: string;
  profilePath: string;
  evidenceDir: string;
  logsDir: string;
  visibleTextPath: string | null;
  screenSource: {
    textCommand: string | null;
    screenshotCommand: string | null;
  };
  polling: {
    projectRefreshSeconds: number;
    activeConversationRefreshSeconds: number;
    stalledConversationRefreshSeconds: number;
    healthCheckSeconds: number;
  };
  thresholds: {
    stalledAfterSeconds: number;
    uiDriftConfidenceThreshold: number;
    maxRetriesPerTask: number;
    alertDebounceCount: number;
    completionCandidateConfidence: number;
  };
  writeControls: {
    writesEnabled: boolean;
    readOnlyOnDrift: boolean;
    confirmBeforeHighRiskWrites: boolean;
  };
  localModel: {
    enabled: boolean;
    baseUrl: string;
    modelName: string;
    timeoutMs: number;
  };
  logging: {
    level: LogLevel;
    json: boolean;
    redactSensitiveFields: boolean;
  };
}

export const defaultConfig: AppConfig = {
  dbPath: "./runtime/overseer.sqlite",
  appName: "Antigravity",
  windowTitlePattern: "Antigravity",
  profilePath: "./runtime/profile",
  evidenceDir: "./runtime/evidence",
  logsDir: "./runtime/logs",
  visibleTextPath: null,
  screenSource: {
    textCommand: null,
    screenshotCommand: null
  },
  polling: {
    projectRefreshSeconds: 300,
    activeConversationRefreshSeconds: 60,
    stalledConversationRefreshSeconds: 180,
    healthCheckSeconds: 120
  },
  thresholds: {
    stalledAfterSeconds: 900,
    uiDriftConfidenceThreshold: 0.72,
    maxRetriesPerTask: 3,
    alertDebounceCount: 2,
    completionCandidateConfidence: 0.8
  },
  writeControls: {
    writesEnabled: false,
    readOnlyOnDrift: true,
    confirmBeforeHighRiskWrites: true
  },
  localModel: {
    enabled: false,
    baseUrl: "http://127.0.0.1:1234/v1",
    modelName: "local-helper",
    timeoutMs: 15000
  },
  logging: {
    level: "info",
    json: false,
    redactSensitiveFields: true
  }
};
