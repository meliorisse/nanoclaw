import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';

interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
  isUser: boolean;
}

interface WebUIChannel {
  channelName: string;
  jid: string;
  app: express.Application;
  wss: WebSocketServer;
  clients: Map<string, WebSocket>;
  messageHistory: Message[];
}

export class WebUIChannel {
  private port: number;
  private app: express.Application;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocket> = new Map();
  private messageHistory: Message[] = [];
  private messageIdCounter = 0;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();

    // Serve static files
    const publicDir = path.join(__dirname, 'public');
    if (fs.existsSync(publicDir)) {
      this.app.use(express.static(publicDir));
    }

    // JSON parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Session management
    this.app.use((req, res, next) => {
      if (!res.locals.sessionId) {
        res.locals.sessionId = `session_${Date.now()}_${++this.messageIdCounter}`;
      }
      next();
    });
  }

  /**
   * Initialize the web UI channel
   */
  async initialize(): Promise<{ success: boolean; port: number; jid: string }> {
    // Create HTTP server
    this.server = http.createServer(this.app);

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server });

    // Handle WebSocket connections
    this.wss.on('connection', (ws: WebSocket) => {
      const sessionId = `client_${Date.now()}_${++this.messageIdCounter}`;
      this.clients.set(sessionId, ws);

      // Send message history to new client
      ws.send(JSON.stringify({
        type: 'history',
        messages: this.messageHistory.slice(-50) // Last 50 messages
      }));

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(sessionId, message);
        } catch (error) {
          console.error('WebUI: Error parsing client message:', error);
        }
      });

      ws.on('close', () => {
        this.clients.delete(sessionId);
      });

      ws.on('error', (error) => {
        console.error('WebUI: WebSocket error:', error);
      });
    });

    // Start server
    return new Promise((resolve) => {
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`WebUI channel started at http://127.0.0.1:${this.port}`);
        resolve({
          success: true,
          port: this.port,
          jid: 'webui@localhost'
        });
      });
    });
  }

  /**
   * Handle incoming messages from WebSocket clients
   */
  private handleClientMessage(sessionId: string, message: any): void {
    if (message.type === 'chat') {
      const content = message.content?.trim();

      if (content) {
        // Add to history
        const msg: Message = {
          id: `msg_${++this.messageIdCounter}`,
          sender: 'user',
          content,
          timestamp: Date.now(),
          isUser: true
        };
        this.messageHistory.push(msg);

        // Broadcast to all clients
        this.broadcast({
          type: 'message',
          message: msg
        });

        // Emit to NanoClaw IPC
        this.emitToNanoClaw({
          type: 'incoming_message',
          channel: 'webui',
          jid: 'webui@localhost',
          from: 'user',
          content,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Send a message to all connected clients
   */
  sendMessage(content: string, isUser: boolean = false): void {
    const msg: Message = {
      id: `msg_${++this.messageIdCounter}`,
      sender: isUser ? 'user' : 'assistant',
      content,
      timestamp: Date.now(),
      isUser
    };

    this.messageHistory.push(msg);

    this.broadcast({
      type: 'message',
      message: msg
    });
  }

  /**
   * Broadcast message to all WebSocket clients
   */
  private broadcast(data: any): void {
    const message = JSON.stringify(data);
    for (const client of this.clients.values()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Emit message to NanoClaw via IPC
   */
  private emitToNanoClaw(data: any): void {
    const ipcPath = path.join('/tmp', 'nanoclaw-ipc');

    // Try to write to IPC socket
    try {
      if (fs.existsSync(ipcPath)) {
        fs.writeFileSync(ipcPath, JSON.stringify(data));
      } else {
        // Fallback: write to a file that NanoClaw monitors
        const ipcDir = path.join(process.cwd(), 'ipc');
        if (!fs.existsSync(ipcDir)) {
          fs.mkdirSync(ipcDir, { recursive: true });
        }
        const timestamp = Date.now();
        fs.writeFileSync(
          path.join(ipcDir, `webui_${timestamp}.json`),
          JSON.stringify(data)
        );
      }
    } catch (error) {
      console.error('WebUI: Failed to emit to NanoClaw:', error);
    }
  }

  /**
   * Get channel info for registration
   */
  getChannelInfo(): { name: string; jid: string } {
    return {
      name: 'webui',
      jid: 'webui@localhost'
    };
  }

  /**
   * Stop the web UI channel
   */
  async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close();
    }
    if (this.server) {
      await new Promise((resolve) => {
        this.server!.close(() => resolve(undefined));
      });
    }
  }
}

export default WebUIChannel;
