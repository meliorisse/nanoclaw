import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { AppConfig } from "../config/defaults.ts";
import type { SyncVisibleStateResult } from "./visible-sync.ts";

export interface HealthReport {
  ok: boolean;
  backendMode: "command" | "fixture" | "unconfigured";
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
  const backendMode = config.screenSource.textCommand
    ? "command"
    : config.visibleTextPath
      ? "fixture"
      : "unconfigured";

  if (backendMode === "unconfigured") {
    warnings.push("No screen text source is configured. Set OVERSEER_VISIBLE_TEXT_PATH or OVERSEER_SCREEN_TEXT_COMMAND.");
  }

  if (config.visibleTextPath) {
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
    screenshotSourceConfigured: Boolean(config.screenSource.screenshotCommand),
    visibleProjects: sync.projects.length,
    visibleConversations: sync.conversations.length,
    activeConversationRef,
    warnings
  };
}
