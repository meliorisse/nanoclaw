export interface AdditionalMount {
  hostPath: string; // Absolute path on host (supports ~ for home)
  containerPath?: string; // Optional — defaults to basename of hostPath. Mounted at /workspace/extra/{value}
  readonly?: boolean; // Default: true for safety
}

/**
 * Mount Allowlist - Security configuration for additional mounts
 * This file should be stored at ~/.config/nanoclaw/mount-allowlist.json
 * and is NOT mounted into any container, making it tamper-proof from agents.
 */
export interface MountAllowlist {
  // Directories that can be mounted into containers
  allowedRoots: AllowedRoot[];
  // Glob patterns for paths that should never be mounted (e.g., ".ssh", ".gnupg")
  blockedPatterns: string[];
  // If true, non-main groups can only mount read-only regardless of config
  nonMainReadOnly: boolean;
}

export interface AllowedRoot {
  // Absolute path or ~ for home (e.g., "~/projects", "/var/repos")
  path: string;
  // Whether read-write mounts are allowed under this root
  allowReadWrite: boolean;
  // Optional description for documentation
  description?: string;
}

export interface ContainerConfig {
  additionalMounts?: AdditionalMount[];
  timeout?: number; // Default: 300000 (5 minutes)
}

export interface RegisteredGroup {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  containerConfig?: ContainerConfig;
  requiresTrigger?: boolean; // Default: true for groups, false for solo chats
  isMain?: boolean; // True for the main control group (no trigger, elevated privileges)
  hostMode?: boolean; // Run agent directly on host instead of inside a Docker container
}

export interface NewMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean;
  is_bot_message?: boolean;
}

export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

export type AgentProvider = 'local' | 'antigravity';
export type EffortLevel = 'low' | 'high';
export type AgentThreadState =
  | 'idle'
  | 'running'
  | 'queued'
  | 'waiting'
  | 'scheduled'
  | 'unknown';

export interface AgentThread {
  id: string;
  provider: AgentProvider;
  externalRef: string;
  title: string;
  groupJid: string | null;
  effort: EffortLevel;
  desiredEffort: EffortLevel | null;
  state: AgentThreadState;
  lastSeenAt: string;
  metadataJson: string | null;
}

export interface AgentProviderHealth {
  provider: AgentProvider;
  enabled: boolean;
  available: boolean;
  pollIntervalMs: number;
  warnings: string[];
}

export interface AntigravityProjectOption {
  projectId: string;
  projectRef: string;
  name: string;
}

export interface AntigravityGroupMapping {
  groupJid: string;
  projectId: string;
  projectRef: string;
  projectName: string;
  updatedAt: string;
}

export interface AgentThreadAction {
  id: number;
  threadId: string;
  actionType: string;
  targetEffort: EffortLevel | null;
  status: string;
  note: string | null;
  createdAt: string;
}

export interface AgentThreadTimeline {
  thread: AgentThread | null;
  actions: AgentThreadAction[];
}

export interface AgentThreadPreviewMessage {
  role: 'user' | 'assistant' | 'system' | 'unknown';
  author: string;
  text: string;
  createdAt: string | null;
}

export interface AgentThreadEvidenceLink {
  label: string;
  path: string;
  kind: 'file' | 'url';
}

export interface AgentThreadInspector {
  thread: AgentThread | null;
  actions: AgentThreadAction[];
  summary: string | null;
  previewMessages: AgentThreadPreviewMessage[];
  evidence: AgentThreadEvidenceLink[];
}

export interface AgentDashboardSnapshot {
  updatedAt: string;
  refreshIntervalMs: number;
  warnings: string[];
  providers: AgentProviderHealth[];
  antigravityProjects: AntigravityProjectOption[];
  antigravityMappings: AntigravityGroupMapping[];
  threads: AgentThread[];
}

export interface EffortChangeResult {
  ok: boolean;
  threadId: string;
  targetEffort: EffortLevel;
  message: string;
}

export interface ThreadMessageResult {
  ok: boolean;
  threadId: string;
  message: string;
}

// --- Channel abstraction ---

export interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, text: string): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  disconnect(): Promise<void>;
  // Optional: typing indicator. Channels that support it implement it.
  setTyping?(jid: string, isTyping: boolean): Promise<void>;
  // Optional: sync group/chat names from the platform.
  syncGroups?(force: boolean): Promise<void>;
}

// Callback type that channels use to deliver inbound messages
export type OnInboundMessage = (chatJid: string, message: NewMessage) => void;

// Callback for chat metadata discovery.
// name is optional — channels that deliver names inline (Telegram) pass it here;
// channels that sync names separately (via syncGroups) omit it.
export type OnChatMetadata = (
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
) => void;
