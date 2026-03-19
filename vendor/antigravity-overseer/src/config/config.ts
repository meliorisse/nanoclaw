import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { defaultConfig, type AppConfig } from "./defaults.ts";

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value === "true" || value === "1";
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mergeConfig(base: AppConfig, override: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...override,
    extensionBridge: { ...base.extensionBridge, ...override.extensionBridge },
    legacyUi: { ...base.legacyUi, ...override.legacyUi },
    polling: { ...base.polling, ...override.polling },
    thresholds: { ...base.thresholds, ...override.thresholds },
    writeControls: { ...base.writeControls, ...override.writeControls },
    localModel: { ...base.localModel, ...override.localModel },
    logging: { ...base.logging, ...override.logging }
  };
}

async function loadFileOverride(configPath: string | undefined): Promise<Partial<AppConfig>> {
  if (!configPath) {
    return {};
  }

  try {
    await access(configPath, fsConstants.R_OK);
  } catch {
    return {};
  }

  const raw = await readFile(configPath, "utf8");
  return JSON.parse(raw) as Partial<AppConfig>;
}

export async function loadConfig(): Promise<AppConfig> {
  const fileOverride = await loadFileOverride(process.env.OVERSEER_CONFIG_PATH);
  const merged = mergeConfig(defaultConfig, fileOverride);

  return {
    ...merged,
    dbPath: process.env.OVERSEER_DB_PATH ?? merged.dbPath,
    appName: process.env.OVERSEER_APP_NAME ?? merged.appName,
    windowTitlePattern: process.env.OVERSEER_WINDOW_TITLE_PATTERN ?? merged.windowTitlePattern,
    profilePath: process.env.OVERSEER_PROFILE_PATH ?? merged.profilePath,
    evidenceDir: process.env.OVERSEER_EVIDENCE_DIR ?? merged.evidenceDir,
    logsDir: process.env.OVERSEER_LOGS_DIR ?? merged.logsDir,
    extensionBridge: {
      enabled: readBoolean(
        process.env.OVERSEER_EXTENSION_BRIDGE_ENABLED,
        merged.extensionBridge.enabled
      ),
      host: process.env.OVERSEER_EXTENSION_BRIDGE_HOST ?? merged.extensionBridge.host,
      port: readNumber(
        process.env.OVERSEER_EXTENSION_BRIDGE_PORT,
        merged.extensionBridge.port
      ),
      authToken:
        process.env.OVERSEER_EXTENSION_BRIDGE_AUTH_TOKEN ||
        merged.extensionBridge.authToken,
      inboxDir:
        process.env.OVERSEER_EXTENSION_BRIDGE_INBOX_DIR ??
        merged.extensionBridge.inboxDir,
      commandsDir:
        process.env.OVERSEER_EXTENSION_BRIDGE_COMMANDS_DIR ??
        merged.extensionBridge.commandsDir,
      resultsDir:
        process.env.OVERSEER_EXTENSION_BRIDGE_RESULTS_DIR ??
        merged.extensionBridge.resultsDir,
      latestSnapshotPath:
        process.env.OVERSEER_EXTENSION_BRIDGE_SNAPSHOT_PATH ??
        merged.extensionBridge.latestSnapshotPath,
      latestVisibleTextPath:
        process.env.OVERSEER_EXTENSION_BRIDGE_VISIBLE_TEXT_PATH ??
        merged.extensionBridge.latestVisibleTextPath,
      maxPayloadBytes: readNumber(
        process.env.OVERSEER_EXTENSION_BRIDGE_MAX_PAYLOAD_BYTES,
        merged.extensionBridge.maxPayloadBytes
      ),
      staleClaimSeconds: readNumber(
        process.env.OVERSEER_EXTENSION_BRIDGE_STALE_CLAIM_SECONDS,
        merged.extensionBridge.staleClaimSeconds
      )
    },
    legacyUi: {
      enabled: readBoolean(
        process.env.OVERSEER_LEGACY_UI_ENABLED,
        merged.legacyUi.enabled
      )
    },
    visibleTextPath: process.env.OVERSEER_VISIBLE_TEXT_PATH || merged.visibleTextPath,
    screenSource: {
      textCommand: process.env.OVERSEER_SCREEN_TEXT_COMMAND || merged.screenSource.textCommand,
      screenshotCommand:
        process.env.OVERSEER_SCREENSHOT_COMMAND || merged.screenSource.screenshotCommand
    },
    polling: {
      projectRefreshSeconds: readNumber(
        process.env.OVERSEER_PROJECT_REFRESH_SECONDS,
        merged.polling.projectRefreshSeconds
      ),
      activeConversationRefreshSeconds: readNumber(
        process.env.OVERSEER_ACTIVE_CONVERSATION_REFRESH_SECONDS,
        merged.polling.activeConversationRefreshSeconds
      ),
      stalledConversationRefreshSeconds: readNumber(
        process.env.OVERSEER_STALLED_CONVERSATION_REFRESH_SECONDS,
        merged.polling.stalledConversationRefreshSeconds
      ),
      healthCheckSeconds: readNumber(
        process.env.OVERSEER_HEALTH_CHECK_SECONDS,
        merged.polling.healthCheckSeconds
      )
    },
    thresholds: {
      stalledAfterSeconds: readNumber(
        process.env.OVERSEER_STALLED_AFTER_SECONDS,
        merged.thresholds.stalledAfterSeconds
      ),
      uiDriftConfidenceThreshold: readNumber(
        process.env.OVERSEER_UI_DRIFT_CONFIDENCE_THRESHOLD,
        merged.thresholds.uiDriftConfidenceThreshold
      ),
      maxRetriesPerTask: readNumber(
        process.env.OVERSEER_MAX_RETRIES_PER_TASK,
        merged.thresholds.maxRetriesPerTask
      ),
      alertDebounceCount: readNumber(
        process.env.OVERSEER_ALERT_DEBOUNCE_COUNT,
        merged.thresholds.alertDebounceCount
      ),
      completionCandidateConfidence: readNumber(
        process.env.OVERSEER_COMPLETION_CANDIDATE_CONFIDENCE,
        merged.thresholds.completionCandidateConfidence
      )
    },
    writeControls: {
      writesEnabled: readBoolean(process.env.OVERSEER_WRITES_ENABLED, merged.writeControls.writesEnabled),
      readOnlyOnDrift: readBoolean(
        process.env.OVERSEER_READ_ONLY_ON_DRIFT,
        merged.writeControls.readOnlyOnDrift
      ),
      confirmBeforeHighRiskWrites: readBoolean(
        process.env.OVERSEER_CONFIRM_HIGH_RISK_WRITES,
        merged.writeControls.confirmBeforeHighRiskWrites
      )
    },
    localModel: {
      enabled: readBoolean(process.env.OVERSEER_LOCAL_MODEL_ENABLED, merged.localModel.enabled),
      baseUrl: process.env.OVERSEER_LOCAL_MODEL_BASE_URL ?? merged.localModel.baseUrl,
      modelName: process.env.OVERSEER_LOCAL_MODEL_NAME ?? merged.localModel.modelName,
      timeoutMs: readNumber(process.env.OVERSEER_LOCAL_MODEL_TIMEOUT_MS, merged.localModel.timeoutMs)
    },
    logging: {
      level: (process.env.OVERSEER_LOG_LEVEL as AppConfig["logging"]["level"] | undefined) ?? merged.logging.level,
      json: readBoolean(process.env.OVERSEER_LOG_JSON, merged.logging.json),
      redactSensitiveFields: readBoolean(
        process.env.OVERSEER_REDACT_SENSITIVE_FIELDS,
        merged.logging.redactSensitiveFields
      )
    }
  };
}
