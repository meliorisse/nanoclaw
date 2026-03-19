import { access, readFile, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { AppConfig } from "../config/defaults.ts";
import { resolveFromRoot } from "../utils/paths.ts";
import type { ExtensionBridgePayload, StoredBridgeEvent } from "./receiver.ts";
import { snapshotHasUsefulState } from "./receiver.ts";

function isUsefulSnapshot(event: StoredBridgeEvent | null | undefined): event is StoredBridgeEvent {
  return Boolean(event?.payload && snapshotHasUsefulState(event.payload));
}

export async function readLatestBridgeSnapshot(
  config: AppConfig
): Promise<StoredBridgeEvent | null> {
  if (!config.extensionBridge.enabled) {
    return null;
  }

  const snapshotPath = resolveFromRoot(config.extensionBridge.latestSnapshotPath);

  try {
    await access(snapshotPath, fsConstants.R_OK);
  } catch {
    return null;
  }

  const raw = await readFile(snapshotPath, "utf8");
  const parsed = JSON.parse(raw) as StoredBridgeEvent;

  if (isUsefulSnapshot(parsed)) {
    return parsed;
  }

  const inboxDir = resolveFromRoot(config.extensionBridge.inboxDir);
  let entries: string[] = [];
  try {
    entries = await readdir(inboxDir);
  } catch {
    return null;
  }

  const candidateFiles = entries
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .reverse();

  for (const entry of candidateFiles) {
    try {
      const eventRaw = await readFile(`${inboxDir}/${entry}`, "utf8");
      const event = JSON.parse(eventRaw) as StoredBridgeEvent;
      if (isUsefulSnapshot(event)) {
        return event;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function isStructuredBridgeSnapshot(
  payload: ExtensionBridgePayload
): boolean {
  return payload.kind === "agent_manager_snapshot";
}
