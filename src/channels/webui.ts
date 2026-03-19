/**
 * WebUI Channel for NanoClaw — Communication Layer
 *
 * Serves a browser-based chat interface on http://localhost:3030.
 * The WebUI is a pure communication channel: it stores user messages in the DB
 * and nanoclaw's full agent pipeline handles the AI response (with real tool
 * access — bash, files, web, etc.). Responses arrive via sendMessage() and are
 * pushed to all connected WebSocket clients.
 *
 * HTTP endpoints:
 *   GET /          → frontend HTML
 *   GET /api/status → live JSON: groups, tasks, uptime
 *   WS  /ws        → bidirectional chat
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

import { registerChannel, ChannelOpts } from './registry.js';
import { Channel, NewMessage } from '../types.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { getAllTasks, getChatHistory } from '../db.js';

// Always serve the frontend from the project source tree (works from both
// dist/channels/webui.js and src/channels/webui.ts via tsx).
const FRONTEND_DIR = path.join(
  process.cwd(),
  'src',
  'channels',
  'webui-frontend',
);

const WEBUI_JID = 'webui@local';
const WEBUI_FOLDER = 'webui_control';
const WEBUI_SENDER = 'user@webui';

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  const env = readEnvFile(['WEBUI_PORT', 'ASSISTANT_NAME']);
  return {
    port: parseInt(env.WEBUI_PORT || '3030', 10),
    assistantName: env.ASSISTANT_NAME || 'Andy',
  };
}

// ── ANSI strip ────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\[[0-9;]*m/g;

function tailLog(n = 20): string {
  const logPath = path.join(process.cwd(), 'logs', 'nanoclaw.log');
  try {
    if (!fs.existsSync(logPath)) return '(no log file yet)';
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    return lines
      .slice(-n)
      .map((l) => l.replace(ANSI_RE, ''))
      .join('\n');
  } catch {
    return '(error reading log)';
  }
}

// ── Status API ────────────────────────────────────────────────────────────────

async function buildStatus(opts: ChannelOpts): Promise<{
  uptime: number;
  groups: Array<{ jid: string; name: string; folder: string; isMain: boolean }>;
  tasks: Array<{
    id: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>;
  threads: Awaited<ReturnType<ChannelOpts['getAgentDashboard']>>['threads'];
  providers: Awaited<ReturnType<ChannelOpts['getAgentDashboard']>>['providers'];
  antigravityProjects: Awaited<
    ReturnType<ChannelOpts['getAgentDashboard']>
  >['antigravityProjects'];
  antigravityMappings: Awaited<
    ReturnType<ChannelOpts['getAgentDashboard']>
  >['antigravityMappings'];
  warnings: string[];
  refreshIntervalMs: number;
  logTail: string;
}> {
  const tasks = getAllTasks();
  const dashboard = await opts.getAgentDashboard();

  return {
    uptime: process.uptime(),
    groups: Object.entries(opts.registeredGroups()).map(([jid, g]) => ({
      jid,
      name: g.name,
      folder: g.folder,
      isMain: g.isMain || false,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      prompt: t.prompt.slice(0, 80),
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
    threads: dashboard.threads,
    providers: dashboard.providers,
    antigravityProjects: dashboard.antigravityProjects,
    antigravityMappings: dashboard.antigravityMappings,
    warnings: dashboard.warnings,
    refreshIntervalMs: dashboard.refreshIntervalMs,
    logTail: tailLog(20),
  };
}

// ── WebUI Channel ─────────────────────────────────────────────────────────────

class WebuiChannel implements Channel {
  name = 'webui';
  private server: http.Server;
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private opts: ChannelOpts;
  private cfg = loadConfig();

  constructor(opts: ChannelOpts) {
    this.opts = opts;
    this.server = http.createServer((req, res) => {
      this.handleHttp(req, res).catch((err) => {
        logger.error({ err }, 'WebUI HTTP handler failed');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ ok: false, error: 'Internal server error' }));
      });
    });
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (ws) => this.handleClient(ws));
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────

  private async handleHttp(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const urlPath = (req.url ?? '/').split('?')[0];

    if (req.method === 'GET' && urlPath === '/api/status') {
      const json = JSON.stringify(await buildStatus(this.opts));
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      });
      res.end(json);
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/history') {
      const rows = getChatHistory(WEBUI_JID, 100);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      });
      res.end(JSON.stringify(rows));
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/threads/timeline') {
      const reqUrl = new URL(
        req.url ?? '/api/threads/timeline',
        'http://127.0.0.1',
      );
      const threadId = reqUrl.searchParams.get('threadId');

      if (!threadId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'threadId is required.' }));
        return;
      }

      const timeline = this.opts.getThreadTimeline(threadId);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      });
      res.end(JSON.stringify({ ok: true, data: timeline }));
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/threads/inspector') {
      const reqUrl = new URL(
        req.url ?? '/api/threads/inspector',
        'http://127.0.0.1',
      );
      const threadId = reqUrl.searchParams.get('threadId');

      if (!threadId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'threadId is required.' }));
        return;
      }

      const inspector = await this.opts.getThreadInspector(threadId);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      });
      res.end(JSON.stringify({ ok: true, data: inspector }));
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/files') {
      const reqUrl = new URL(req.url ?? '/api/files', 'http://127.0.0.1');
      const requestedPath = reqUrl.searchParams.get('path');

      if (!requestedPath || !path.isAbsolute(requestedPath)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ ok: false, error: 'An absolute path is required.' }),
        );
        return;
      }

      if (
        !fs.existsSync(requestedPath) ||
        !fs.statSync(requestedPath).isFile()
      ) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'File not found.' }));
        return;
      }

      const ext = path.extname(requestedPath).slice(1).toLowerCase();
      const mime: Record<string, string> = {
        html: 'text/html;charset=utf-8',
        js: 'text/javascript',
        css: 'text/css',
        json: 'application/json',
        log: 'text/plain;charset=utf-8',
        md: 'text/markdown;charset=utf-8',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        svg: 'image/svg+xml',
        txt: 'text/plain;charset=utf-8',
      };

      res.writeHead(200, {
        'Content-Type': mime[ext] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(requestedPath).pipe(res);
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/threads/effort') {
      const body = await this.readRequestBody(req);
      const data = JSON.parse(body || '{}') as {
        threadId?: string;
        targetEffort?: 'low' | 'high';
      };

      if (
        !data.threadId ||
        (data.targetEffort !== 'low' && data.targetEffort !== 'high')
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: 'threadId and targetEffort are required.',
          }),
        );
        return;
      }

      const result = await this.opts.requestEffortChange(
        data.threadId,
        data.targetEffort,
      );

      res.writeHead(result.ok ? 200 : 409, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/threads/message') {
      const body = await this.readRequestBody(req);
      const data = JSON.parse(body || '{}') as {
        threadId?: string;
        text?: string;
      };

      if (
        !data.threadId ||
        typeof data.text !== 'string' ||
        !data.text.trim()
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: 'threadId and non-empty text are required.',
          }),
        );
        return;
      }

      const result = await this.opts.sendThreadMessage(
        data.threadId,
        data.text,
      );

      res.writeHead(result.ok ? 200 : 409, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/antigravity/mappings') {
      const body = await this.readRequestBody(req);
      const data = JSON.parse(body || '{}') as {
        groupJid?: string;
        projectId?: string;
      };

      if (!data.groupJid || !data.projectId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: 'groupJid and projectId are required.',
          }),
        );
        return;
      }

      const result = await this.opts.setAntigravityMapping(
        data.groupJid,
        data.projectId,
      );

      res.writeHead(result.ok ? 200 : 404, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/antigravity/launch') {
      const body = await this.readRequestBody(req);
      const data = JSON.parse(body || '{}') as {
        groupJid?: string;
        brief?: string;
      };

      if (!data.groupJid || typeof data.brief !== 'string' || !data.brief.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: 'groupJid and non-empty brief are required.',
          }),
        );
        return;
      }

      const result = await this.opts.launchAntigravityPrompt(
        data.groupJid,
        data.brief,
      );

      res.writeHead(result.ok ? 200 : 409, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end();
      return;
    }

    const filePath = path.join(
      FRONTEND_DIR,
      urlPath === '/' ? 'index.html' : urlPath,
    );
    if (!filePath.startsWith(FRONTEND_DIR) || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).slice(1);
    const mime: Record<string, string> = {
      html: 'text/html;charset=utf-8',
      js: 'text/javascript',
      css: 'text/css',
      png: 'image/png',
      svg: 'image/svg+xml',
    };
    res.writeHead(200, { 'Content-Type': mime[ext] ?? 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  }

  private async readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  // ── Channel interface ─────────────────────────────────────────────────────

  async connect(): Promise<void> {
    // Register the webui group so nanoclaw's message loop processes its messages
    this.opts.registerGroup(WEBUI_JID, {
      name: 'WebUI Control',
      folder: WEBUI_FOLDER,
      trigger: `@${this.cfg.assistantName}`,
      requiresTrigger: false,
      hostMode: true,
      added_at: new Date().toISOString(),
    });

    // Seed chat metadata so the FK constraint in storeMessage is satisfied
    this.opts.onChatMetadata(
      WEBUI_JID,
      new Date().toISOString(),
      'WebUI Control',
      'webui',
      false,
    );

    return new Promise((resolve) => {
      this.server.listen(this.cfg.port, '127.0.0.1', () => {
        logger.info(
          { port: this.cfg.port },
          `WebUI channel listening — http://localhost:${this.cfg.port}`,
        );
        resolve();
      });
    });
  }

  /** Called by nanoclaw when the agent sends a response. Push to all clients and persist to DB. */
  async sendMessage(jid: string, text: string): Promise<void> {
    // Broadcast to all connected browser clients
    const payload = JSON.stringify({ type: 'bot_message', text });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
    // Persist to SQLite so history loads correctly on next tab open
    const botMsg: NewMessage = {
      id: `webui-bot-${Date.now()}`,
      chat_jid: jid,
      sender: `${this.cfg.assistantName.toLowerCase()}@webui`,
      sender_name: this.cfg.assistantName,
      content: text,
      timestamp: new Date().toISOString(),
      is_from_me: true,
      is_bot_message: true,
    };
    this.opts.onMessage(jid, botMsg);
  }

  isConnected(): boolean {
    return this.server.listening;
  }
  ownsJid(jid: string): boolean {
    return jid === WEBUI_JID;
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      for (const ws of this.clients) ws.close();
      this.wss.close();
      this.server.close(() => resolve());
    });
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────

  private handleClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.send(
      JSON.stringify({ type: 'config', assistantName: this.cfg.assistantName }),
    );

    // Deliver conversation history immediately on connect
    try {
      const rows = getChatHistory(WEBUI_JID, 100);
      if (rows.length > 0) {
        ws.send(JSON.stringify({ type: 'history', messages: rows }));
      }
    } catch (err) {
      logger.warn({ err }, 'WebUI: failed to load history');
    }

    ws.on('close', () => this.clients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as {
          type: string;
          text?: string;
        };
        if (data.type === 'message' && typeof data.text === 'string') {
          this.handleUserMessage(data.text);
        }
      } catch (err) {
        logger.warn({ err }, 'WebUI: invalid WS message');
      }
    });
  }

  private handleUserMessage(text: string): void {
    // Store message in DB — nanoclaw's message loop will pick it up,
    // run the agent container, and call sendMessage() with the response.
    const msg: NewMessage = {
      id: `webui-${Date.now()}`,
      chat_jid: WEBUI_JID,
      sender: WEBUI_SENDER,
      sender_name: 'You',
      content: text,
      timestamp: new Date().toISOString(),
      is_from_me: false,
      is_bot_message: false,
    };
    this.opts.onMessage(WEBUI_JID, msg);
    logger.debug(
      { text: text.slice(0, 60) },
      'WebUI: message queued for agent',
    );
  }
}

// ── Self-registration ─────────────────────────────────────────────────────────

registerChannel('webui', (opts: ChannelOpts): Channel | null => {
  return new WebuiChannel(opts);
});
