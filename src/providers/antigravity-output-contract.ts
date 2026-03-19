import fs from 'fs';
import path from 'path';

import type {
  AgentThread,
  AgentThreadEvidenceLink,
  AgentThreadPreviewMessage,
} from '../types.js';

export interface AntigravityOutputContract {
  contractId: string;
  jsonPath: string;
  markdownPath: string;
}

interface ContractPayloadMessage {
  role?: string;
  author?: string;
  text?: string;
  createdAt?: string | null;
}

interface ContractPayload {
  version?: number;
  updatedAt?: string;
  status?: string;
  summary?: string;
  messages?: ContractPayloadMessage[];
}

export interface ParsedAntigravityArtifact {
  summary: string | null;
  previewMessages: AgentThreadPreviewMessage[];
  evidence: AgentThreadEvidenceLink[];
}

const CONTRACT_VERSION = 1;
const CONTRACT_BASE_DIR = path.join(
  process.cwd(),
  'runtime',
  'antigravity-contracts',
);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function ensureContractDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function createLaunchOutputContract(input: {
  projectRef: string;
  groupJid: string;
}): AntigravityOutputContract {
  const contractId = `launch-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const dir = path.join(
    CONTRACT_BASE_DIR,
    'launches',
    `${slugify(input.projectRef)}-${slugify(input.groupJid) || 'group'}`,
    contractId,
  );
  ensureContractDir(dir);

  return {
    contractId,
    jsonPath: path.join(dir, 'result.json'),
    markdownPath: path.join(dir, 'result.md'),
  };
}

export function getThreadOutputContract(
  thread: Pick<AgentThread, 'externalRef' | 'metadataJson'>,
): AntigravityOutputContract {
  const metadata = parseMetadata(thread.metadataJson);
  const jsonPath =
    typeof metadata.artifactJsonPath === 'string'
      ? metadata.artifactJsonPath
      : null;
  const markdownPath =
    typeof metadata.artifactMarkdownPath === 'string'
      ? metadata.artifactMarkdownPath
      : null;
  const contractId =
    typeof metadata.artifactContractId === 'string'
      ? metadata.artifactContractId
      : null;

  if (jsonPath && markdownPath && contractId) {
    ensureContractDir(path.dirname(jsonPath));
    return {
      contractId,
      jsonPath,
      markdownPath,
    };
  }

  const safeRef = slugify(thread.externalRef) || 'thread';
  const dir = path.join(CONTRACT_BASE_DIR, 'threads', safeRef);
  ensureContractDir(dir);
  return {
    contractId: `thread-${safeRef}`,
    jsonPath: path.join(dir, 'result.json'),
    markdownPath: path.join(dir, 'result.md'),
  };
}

export function buildLaunchContractInstruction(
  contract: AntigravityOutputContract,
): string {
  return [
    'NanoClaw output contract (required): before you finish your turn, you must overwrite both of these files with the canonical result of this Antigravity task.',
    `JSON state file: ${contract.jsonPath}`,
    `Markdown response file: ${contract.markdownPath}`,
    `JSON schema: {"version":${CONTRACT_VERSION},"updatedAt":"ISO-8601","status":"working|blocked|complete","summary":"short summary","messages":[{"role":"user|assistant","text":"exact text","createdAt":"ISO-8601 or null"}]}`,
    'Rewrite the full JSON messages array every turn so NanoClaw can reconstruct the conversation in perfect form without OCR loss.',
    'Preserve exact text, code fences, indentation, and paragraph structure in both files.',
    'Do not omit prior user or assistant messages that are still relevant to the active thread.',
    'Do not mention this output contract or these file paths in your user-visible reply unless explicitly asked.',
  ].join(' ');
}

export function buildMessageContractInstruction(
  contract: AntigravityOutputContract,
): string {
  return [
    'NanoClaw output contract (required): after replying in this thread, you must overwrite the canonical thread files.',
    `JSON: ${contract.jsonPath}`,
    `Markdown: ${contract.markdownPath}`,
    `JSON schema: {"version":${CONTRACT_VERSION},"updatedAt":"ISO-8601","status":"working|blocked|complete","summary":"short summary","messages":[{"role":"user|assistant","text":"exact text","createdAt":"ISO-8601 or null"}]}`,
    'Rewrite the full JSON messages array every turn, preserve exact formatting in markdown, and do not mention the contract in your visible reply.',
  ].join(' ');
}

export function parseArtifactPayload(
  thread: Pick<AgentThread, 'externalRef' | 'metadataJson'>,
): ParsedAntigravityArtifact | null {
  const contract = getThreadOutputContract(thread);
  const evidence: AgentThreadEvidenceLink[] = [];

  let payload: ContractPayload | null = null;
  if (fs.existsSync(contract.jsonPath)) {
    try {
      const raw = fs.readFileSync(contract.jsonPath, 'utf8');
      payload = JSON.parse(raw) as ContractPayload;
      evidence.push({
        label: path.basename(contract.jsonPath),
        path: contract.jsonPath,
        kind: 'file',
      });
    } catch {
      // ignore malformed payloads and fall through
    }
  }

  let markdownText: string | null = null;
  if (fs.existsSync(contract.markdownPath)) {
    try {
      markdownText =
        fs.readFileSync(contract.markdownPath, 'utf8').trim() || null;
      evidence.push({
        label: path.basename(contract.markdownPath),
        path: contract.markdownPath,
        kind: 'file',
      });
    } catch {
      // ignore unreadable markdown and fall through
    }
  }

  const previewMessages = (payload?.messages || [])
    .filter(
      (
        message,
      ): message is Required<Pick<ContractPayloadMessage, 'role' | 'text'>> &
        ContractPayloadMessage =>
        typeof message?.role === 'string' && typeof message?.text === 'string',
    )
    .map((message) => ({
      role: normalizeRole(message.role),
      author:
        typeof message.author === 'string' && message.author.trim()
          ? message.author
          : normalizeRole(message.role) === 'assistant'
            ? 'Antigravity'
            : normalizeRole(message.role) === 'user'
              ? 'User'
              : message.role,
      text: message.text.trim(),
      createdAt:
        typeof message.createdAt === 'string' ? message.createdAt : null,
    }))
    .filter((message) => message.text.length > 0);

  if (previewMessages.length === 0 && markdownText) {
    previewMessages.push({
      role: 'assistant',
      author: 'Antigravity',
      text: markdownText,
      createdAt: null,
    });
  }

  if (previewMessages.length === 0 && !payload?.summary && !markdownText) {
    return null;
  }

  return {
    summary: payload?.summary?.trim() || null,
    previewMessages,
    evidence,
  };
}

function parseMetadata(metadataJson: string | null): Record<string, unknown> {
  if (!metadataJson) return {};
  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeRole(value: string): AgentThreadPreviewMessage['role'] {
  if (value === 'user' || value === 'assistant' || value === 'system') {
    return value;
  }
  return 'unknown';
}
