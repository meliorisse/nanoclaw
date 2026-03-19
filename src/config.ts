import fs from 'fs';
import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
// Secrets (API keys, tokens) are NOT read here — they are loaded only
// by the credential proxy (credential-proxy.ts), never exposed to containers.
const envConfig = readEnvFile(['ASSISTANT_NAME', 'ASSISTANT_HAS_OWN_NUMBER']);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'sender-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const CREDENTIAL_PROXY_PORT = parseInt(
  process.env.CREDENTIAL_PROXY_PORT || '3001',
  10,
);
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default — how long to keep container alive after last result
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);
export const WEBUI_REFRESH_INTERVAL = Math.max(
  1000,
  parseInt(process.env.WEBUI_REFRESH_INTERVAL || '2000', 10) || 2000,
);
export const ANTIGRAVITY_ENABLED =
  (process.env.ANTIGRAVITY_ENABLED || 'true').toLowerCase() === 'true';
export const ANTIGRAVITY_OVERSEER_DIR = path.resolve(
  process.env.ANTIGRAVITY_OVERSEER_DIR ||
    path.join(PROJECT_ROOT, 'vendor', 'antigravity-overseer'),
);
export const ANTIGRAVITY_POLL_INTERVAL = Math.max(
  1000,
  parseInt(process.env.ANTIGRAVITY_POLL_INTERVAL || '2000', 10) || 2000,
);
export const ANTIGRAVITY_OUTPUT_CONTRACT_ENABLED =
  (process.env.ANTIGRAVITY_OUTPUT_CONTRACT_ENABLED || 'false').toLowerCase() ===
  'true';
export const ANTIGRAVITY_MCP_ENTRY =
  process.env.ANTIGRAVITY_MCP_ENTRY || 'src/mcp/server.ts';
export const ANTIGRAVITY_SCREEN_TEXT_COMMAND =
  process.env.ANTIGRAVITY_SCREEN_TEXT_COMMAND ||
  process.env.OVERSEER_SCREEN_TEXT_COMMAND ||
  '';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
