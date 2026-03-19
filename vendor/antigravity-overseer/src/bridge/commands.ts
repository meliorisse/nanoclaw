import path from "node:path";
import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { AppConfig } from "../config/defaults.ts";
import { ensureDir, resolveFromRoot } from "../utils/paths.ts";

export type BridgeCommandKind = "send_message" | "create_followup_agent";
export type BridgeCommandStatus = "pending" | "claimed" | "completed" | "failed";

export interface SendMessageCommandPayload {
  kind: "send_message";
  workspaceRef: string | null;
  workspaceTitle: string | null;
  conversationRef: string;
  conversationTitle: string;
  text: string;
  probeText: string;
}

export interface CreateFollowupAgentCommandPayload {
  kind: "create_followup_agent";
  projectRef: string;
  projectTitle: string;
  brief: string;
  probeText: string;
}

export type BridgeCommandPayload =
  | SendMessageCommandPayload
  | CreateFollowupAgentCommandPayload;

export interface StoredBridgeCommand {
  id: string;
  createdAt: string;
  status: BridgeCommandStatus;
  claimedAt: string | null;
  claimedBy: string | null;
  payload: BridgeCommandPayload;
}

export interface BridgeCommandResultPayload {
  ok: boolean;
  message: string;
  conversationRef?: string | null;
  conversationTitle?: string | null;
  workspaceRef?: string | null;
  workspaceTitle?: string | null;
}

export interface StoredBridgeCommandResult {
  commandId: string;
  completedAt: string;
  ok: boolean;
  message: string;
  conversationRef: string | null;
  conversationTitle: string | null;
  workspaceRef: string | null;
  workspaceTitle: string | null;
}

function commandQueueDir(config: AppConfig): string {
  return resolveFromRoot(config.extensionBridge.commandsDir);
}

function commandResultsDir(config: AppConfig): string {
  return resolveFromRoot(config.extensionBridge.resultsDir);
}

function commandPath(config: AppConfig, id: string): string {
  return path.join(commandQueueDir(config), `${id}.json`);
}

function resultPath(config: AppConfig, id: string): string {
  return path.join(commandResultsDir(config), `${id}.json`);
}

function commandIdFor(payload: BridgeCommandPayload, createdAt: string): string {
  return createHash("sha1")
    .update(JSON.stringify({ payload, createdAt }))
    .digest("hex")
    .slice(0, 12);
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    return null;
  }

  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function listCommandIds(config: AppConfig): Promise<string[]> {
  const dir = commandQueueDir(config);
  await ensureDir(dir);
  const entries = await readdir(dir);
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => entry.replace(/\.json$/, ""))
    .sort();
}

export async function enqueueBridgeCommand(
  config: AppConfig,
  payload: BridgeCommandPayload
): Promise<StoredBridgeCommand> {
  await ensureDir(commandQueueDir(config));
  await ensureDir(commandResultsDir(config));

  const createdAt = new Date().toISOString();
  const id = commandIdFor(payload, createdAt);
  const command: StoredBridgeCommand = {
    id,
    createdAt,
    status: "pending",
    claimedAt: null,
    claimedBy: null,
    payload
  };

  await writeFile(commandPath(config, id), JSON.stringify(command, null, 2), "utf8");
  return command;
}

export async function claimNextBridgeCommand(
  config: AppConfig,
  workerId: string
): Promise<StoredBridgeCommand | null> {
  const ids = await listCommandIds(config);
  const now = Date.now();
  const staleAfterMs = Math.max(1, config.extensionBridge.staleClaimSeconds) * 1000;

  for (const id of ids) {
    const existing = await readJsonIfExists<StoredBridgeCommand>(commandPath(config, id));
    if (!existing) {
      continue;
    }

    const staleClaim =
      existing.status === "claimed" &&
      existing.claimedAt !== null &&
      now - Date.parse(existing.claimedAt) > staleAfterMs;
    if (existing.status !== "pending" && !staleClaim) {
      continue;
    }

    const claimed: StoredBridgeCommand = {
      ...existing,
      status: "claimed",
      claimedAt: new Date().toISOString(),
      claimedBy: workerId
    };
    await writeFile(commandPath(config, id), JSON.stringify(claimed, null, 2), "utf8");
    return claimed;
  }

  return null;
}

export async function completeBridgeCommand(
  config: AppConfig,
  commandId: string,
  result: BridgeCommandResultPayload
): Promise<StoredBridgeCommandResult> {
  await ensureDir(commandResultsDir(config));

  const command = await readJsonIfExists<StoredBridgeCommand>(commandPath(config, commandId));
  if (command) {
    const updatedCommand: StoredBridgeCommand = {
      ...command,
      status: result.ok ? "completed" : "failed"
    };
    await writeFile(commandPath(config, commandId), JSON.stringify(updatedCommand, null, 2), "utf8");
  }

  const storedResult: StoredBridgeCommandResult = {
    commandId,
    completedAt: new Date().toISOString(),
    ok: result.ok,
    message: result.message,
    conversationRef: result.conversationRef ?? null,
    conversationTitle: result.conversationTitle ?? null,
    workspaceRef: result.workspaceRef ?? null,
    workspaceTitle: result.workspaceTitle ?? null
  };
  await writeFile(resultPath(config, commandId), JSON.stringify(storedResult, null, 2), "utf8");
  return storedResult;
}

export async function waitForBridgeCommandResult(
  config: AppConfig,
  commandId: string,
  timeoutMs: number
): Promise<StoredBridgeCommandResult | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await readJsonIfExists<StoredBridgeCommandResult>(resultPath(config, commandId));
    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}
