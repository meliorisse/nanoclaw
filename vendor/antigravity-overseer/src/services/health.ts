import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { AppConfig } from "../config/defaults.ts";
import type { SyncVisibleStateResult } from "./visible-sync.ts";

export interface HealthReport {
  ok: boolean;
  backendMode: "extension-bridge" | "command" | "fixture" | "unconfigured";
  textSourceConfigured: boolean;
  screenshotSourceConfigured: boolean;
  visibleProjects: number;
  visibleConversations: number;
  activeConversationRef: string | null;
  warnings: string[];
}

export async function buildHealthReport(
  config: AppConfig,
  sync: SyncVisibleStateResult,
  activeConversationRef: string | null
): Promise<HealthReport> {
  const warnings: string[] = [...sync.warnings];
  const backendMode = config.visibleTextPath
      ? "fixture"
      : config.legacyUi.enabled && config.screenSource.textCommand
        ? "command"
        : config.extensionBridge.enabled
          ? "extension-bridge"
          : "unconfigured";

  if (backendMode === "unconfigured") {
    warnings.push(
      "No active bridge or legacy screen text source is configured. Enable OVERSEER_EXTENSION_BRIDGE_ENABLED or explicitly enable OVERSEER_LEGACY_UI_ENABLED with a text source."
    );
  }

  if (backendMode !== "extension-bridge" && config.visibleTextPath) {
    try {
      await access(config.visibleTextPath, fsConstants.R_OK);
    } catch {
      warnings.push(`Visible text path is not readable: ${config.visibleTextPath}`);
    }
  }

  if (sync.projects.length === 0) {
    warnings.push("No visible workspaces were detected on the current screen.");
  }

  return {
    ok: warnings.length === 0,
    backendMode,
    textSourceConfigured: backendMode !== "unconfigured",
    screenshotSourceConfigured:
      backendMode === "extension-bridge"
        ? false
        : Boolean(config.screenSource.screenshotCommand),
    visibleProjects: sync.projects.length,
    visibleConversations: sync.conversations.length,
    activeConversationRef,
    warnings
  };
}
