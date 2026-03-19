import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { AppConfig } from "../config/defaults.ts";
import type { Logger } from "../utils/logger.ts";
import { ensureDir, resolveFromRoot } from "../utils/paths.ts";
import {
  claimNextBridgeCommand,
  completeBridgeCommand,
  type BridgeCommandResultPayload
} from "./commands.ts";

export interface ExtensionBridgePayload {
  kind: string;
  source: string;
  capturedAt?: string;
  workspaceRef?: string | null;
  conversationRef?: string | null;
  threadTitle?: string | null;
  visibleText?: string;
  messages?: Array<{
    role: string;
    content: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface StoredBridgeEvent {
  id: string;
  receivedAt: string;
  remoteAddress: string | null;
  payload: ExtensionBridgePayload;
}

export function snapshotHasUsefulState(payload: ExtensionBridgePayload): boolean {
  if (payload.kind !== "agent_manager_snapshot") {
    return false;
  }

  if (typeof payload.visibleText === "string" && payload.visibleText.trim().length > 0) {
    return true;
  }

  if (typeof payload.workspaceRef === "string" && payload.workspaceRef.trim().length > 0) {
    return true;
  }

  if (typeof payload.conversationRef === "string" && payload.conversationRef.trim().length > 0) {
    return true;
  }

  if (typeof payload.threadTitle === "string" && payload.threadTitle.trim().length > 0) {
    return true;
  }

  if (Array.isArray(payload.messages) && payload.messages.length > 0) {
    return true;
  }

  const workspaces = Array.isArray(payload.metadata?.workspaces)
    ? payload.metadata.workspaces
    : [];
  return workspaces.length > 0;
}

function readAuthToken(request: IncomingMessage): string | null {
  const authHeader = request.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  const apiKey = request.headers["x-overseer-token"];
  return typeof apiKey === "string" ? apiKey : null;
}

function writeJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new Error(`Payload exceeds max size of ${maxBytes} bytes.`);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function normalizePayload(raw: unknown): ExtensionBridgePayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.kind !== "string" || !candidate.kind.trim()) {
    throw new Error("Payload.kind must be a non-empty string.");
  }

  if (typeof candidate.source !== "string" || !candidate.source.trim()) {
    throw new Error("Payload.source must be a non-empty string.");
  }

  const messages = Array.isArray(candidate.messages)
    ? candidate.messages.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }

        const message = entry as Record<string, unknown>;
        if (typeof message.role !== "string" || typeof message.content !== "string") {
          return [];
        }

        return [{ role: message.role, content: message.content }];
      })
    : undefined;

  return {
    kind: candidate.kind,
    source: candidate.source,
    capturedAt: typeof candidate.capturedAt === "string" ? candidate.capturedAt : undefined,
    workspaceRef: typeof candidate.workspaceRef === "string" ? candidate.workspaceRef : null,
    conversationRef:
      typeof candidate.conversationRef === "string" ? candidate.conversationRef : null,
    threadTitle: typeof candidate.threadTitle === "string" ? candidate.threadTitle : null,
    visibleText: typeof candidate.visibleText === "string" ? candidate.visibleText : undefined,
    messages,
    metadata:
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : undefined
  };
}

async function persistEvent(config: AppConfig, payload: ExtensionBridgePayload, remoteAddress: string | null) {
  const receivedAt = new Date().toISOString();
  const id = createHash("sha1")
    .update(JSON.stringify({ payload, receivedAt, remoteAddress }))
    .digest("hex")
    .slice(0, 12);

  const inboxDir = resolveFromRoot(config.extensionBridge.inboxDir);
  await ensureDir(inboxDir);

  const event: StoredBridgeEvent = {
    id,
    receivedAt,
    remoteAddress,
    payload
  };

  const eventPath = path.join(inboxDir, `${receivedAt.replaceAll(":", "-")}-${id}.json`);
  await writeFile(eventPath, JSON.stringify(event, null, 2), "utf8");

  let latestSnapshotPath: string | null = null;
  if (snapshotHasUsefulState(payload)) {
    latestSnapshotPath = resolveFromRoot(config.extensionBridge.latestSnapshotPath);
    await ensureDir(path.dirname(latestSnapshotPath));
    await writeFile(latestSnapshotPath, JSON.stringify(event, null, 2), "utf8");
  }

  let latestVisibleTextPath: string | null = null;
  if (payload.visibleText && payload.visibleText.trim()) {
    latestVisibleTextPath = resolveFromRoot(config.extensionBridge.latestVisibleTextPath);
    await ensureDir(path.dirname(latestVisibleTextPath));
    await writeFile(latestVisibleTextPath, payload.visibleText, "utf8");
  }

  return {
    eventPath,
    latestSnapshotPath,
    latestVisibleTextPath
  };
}

export function createExtensionBridgeServer(config: AppConfig, logger: Logger): Server {
  return createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      const url = requestUrl.pathname;

      if (method === "GET" && url === "/health") {
        writeJson(response, 200, {
          ok: true,
          mode: "extension-bridge",
          host: config.extensionBridge.host,
          port: config.extensionBridge.port
        });
        return;
      }

      if (
        method === "POST" &&
        url === "/v1/commands/claim"
      ) {
        if (config.extensionBridge.authToken) {
          const providedToken = readAuthToken(request);
          if (providedToken !== config.extensionBridge.authToken) {
            writeJson(response, 401, {
              ok: false,
              error: "Unauthorized."
            });
            return;
          }
        }

        const rawBody = await readBody(request, config.extensionBridge.maxPayloadBytes);
        const body = rawBody.trim() ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
        const workerId =
          typeof body.workerId === "string" && body.workerId.trim()
            ? body.workerId.trim()
            : "extension-worker";
        const command = await claimNextBridgeCommand(config, workerId);
        writeJson(response, 200, {
          ok: true,
          command
        });
        return;
      }

      const commandResultMatch =
        method === "POST" ? url.match(/^\/v1\/commands\/([^/]+)\/result$/) : null;
      if (commandResultMatch) {
        if (config.extensionBridge.authToken) {
          const providedToken = readAuthToken(request);
          if (providedToken !== config.extensionBridge.authToken) {
            writeJson(response, 401, {
              ok: false,
              error: "Unauthorized."
            });
            return;
          }
        }

        const rawBody = await readBody(request, config.extensionBridge.maxPayloadBytes);
        const body = JSON.parse(rawBody) as Record<string, unknown>;
        if (typeof body.ok !== "boolean" || typeof body.message !== "string") {
          throw new Error("Command result payload must include boolean ok and string message.");
        }

        const result = await completeBridgeCommand(
          config,
          commandResultMatch[1],
          {
            ok: body.ok,
            message: body.message,
            conversationRef:
              typeof body.conversationRef === "string" ? body.conversationRef : null,
            conversationTitle:
              typeof body.conversationTitle === "string" ? body.conversationTitle : null,
            workspaceRef:
              typeof body.workspaceRef === "string" ? body.workspaceRef : null,
            workspaceTitle:
              typeof body.workspaceTitle === "string" ? body.workspaceTitle : null
          } satisfies BridgeCommandResultPayload
        );

        logger.info("Extension bridge command completed.", {
          commandId: result.commandId,
          ok: result.ok
        });
        writeJson(response, 202, {
          ok: true,
          result
        });
        return;
      }

      if (method !== "POST" || url !== "/v1/agent-manager") {
        writeJson(response, 404, {
          ok: false,
          error: "Not found."
        });
        return;
      }

      if (config.extensionBridge.authToken) {
        const providedToken = readAuthToken(request);
        if (providedToken !== config.extensionBridge.authToken) {
          writeJson(response, 401, {
            ok: false,
            error: "Unauthorized."
          });
          return;
        }
      }

      const rawBody = await readBody(request, config.extensionBridge.maxPayloadBytes);
      const payload = normalizePayload(JSON.parse(rawBody) as unknown);
      const persisted = await persistEvent(
        config,
        payload,
        request.socket.remoteAddress ?? null
      );

      logger.info("Extension bridge payload received.", {
        kind: payload.kind,
        source: payload.source,
        eventPath: persisted.eventPath,
        conversationRef: payload.conversationRef ?? undefined
      });

      writeJson(response, 202, {
        ok: true,
        storedAt: persisted.eventPath,
        latestSnapshotPath: persisted.latestSnapshotPath,
        latestVisibleTextPath: persisted.latestVisibleTextPath
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown bridge error.";
      logger.warn("Extension bridge request failed.", { error: message });
      writeJson(response, 400, {
        ok: false,
        error: message
      });
    }
  });
}
