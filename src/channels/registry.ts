import {
  AgentDashboardSnapshot,
  AgentThreadInspector,
  AgentThreadTimeline,
  Channel,
  EffortChangeResult,
  AntigravityGroupMapping,
  ThreadMessageResult,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
} from '../types.js';

export interface ChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  getAgentDashboard: () => Promise<AgentDashboardSnapshot>;
  requestEffortChange: (
    threadId: string,
    targetEffort: 'low' | 'high',
  ) => Promise<EffortChangeResult>;
  setAntigravityMapping: (
    groupJid: string,
    projectId: string,
  ) => Promise<
    | { ok: true; mapping: AntigravityGroupMapping }
    | { ok: false; error: string }
  >;
  launchAntigravityPrompt: (
    groupJid: string,
    brief: string,
  ) => Promise<ThreadMessageResult>;
  getThreadTimeline: (threadId: string) => AgentThreadTimeline;
  getThreadInspector: (threadId: string) => Promise<AgentThreadInspector>;
  sendThreadMessage: (
    threadId: string,
    text: string,
  ) => Promise<ThreadMessageResult>;
}

export type ChannelFactory = (opts: ChannelOpts) => Channel | null;

const registry = new Map<string, ChannelFactory>();

export function registerChannel(name: string, factory: ChannelFactory): void {
  registry.set(name, factory);
}

export function getChannelFactory(name: string): ChannelFactory | undefined {
  return registry.get(name);
}

export function getRegisteredChannelNames(): string[] {
  return [...registry.keys()];
}
