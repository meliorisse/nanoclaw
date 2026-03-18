import {
  deleteAgentThreads,
  getAgentThread,
  getChatHistory,
  listAgentThreads,
  listAgentThreadActions,
  listAntigravityGroupMappings,
  getAllTasks,
  recordAgentThreadAction,
  setAgentThreadDesiredEffort,
  upsertAntigravityGroupMapping,
  upsertAgentThread,
} from './db.js';
import type { GroupQueueSnapshotEntry } from './group-queue.js';
import { AntigravityProvider } from './providers/antigravity.js';
import {
  AgentDashboardSnapshot,
  AgentProviderHealth,
  AgentThreadEvidenceLink,
  AgentThreadInspector,
  AgentThreadPreviewMessage,
  AgentThread,
  AgentThreadTimeline,
  AntigravityGroupMapping,
  EffortChangeResult,
  RegisteredGroup,
  ScheduledTask,
} from './types.js';
import { WEBUI_REFRESH_INTERVAL } from './config.js';

function rankState(state: AgentThread['state']): number {
  switch (state) {
    case 'running':
      return 0;
    case 'queued':
      return 1;
    case 'waiting':
      return 2;
    case 'scheduled':
      return 3;
    case 'idle':
      return 4;
    default:
      return 5;
  }
}

export function buildLocalThreads(input: {
  registeredGroups: Record<string, RegisteredGroup>;
  sessions: Record<string, string>;
  queueSnapshot: Record<string, GroupQueueSnapshotEntry>;
  tasks: ScheduledTask[];
  existingThreads?: Map<string, AgentThread>;
}): AgentThread[] {
  const now = new Date().toISOString();

  return Object.entries(input.registeredGroups).map(([jid, group]) => {
    const queue = input.queueSnapshot[jid];
    const existing = input.existingThreads?.get(`local:${jid}`);
    const taskCount = input.tasks.filter(
      (task) => task.chat_jid === jid,
    ).length;

    let state: AgentThread['state'] = 'idle';
    if (queue?.active) {
      state = 'running';
    } else if (queue?.pendingMessages || (queue?.pendingTaskCount || 0) > 0) {
      state = 'queued';
    } else if (queue?.idleWaiting) {
      state = 'waiting';
    } else if (taskCount > 0) {
      state = 'scheduled';
    }

    return {
      id: `local:${jid}`,
      provider: 'local',
      externalRef: jid,
      title: group.name,
      groupJid: jid,
      effort: 'low',
      desiredEffort: existing?.desiredEffort ?? null,
      state,
      lastSeenAt: now,
      metadataJson: JSON.stringify({
        folder: group.folder,
        hostMode: group.hostMode === true,
        isMain: group.isMain === true,
        taskCount,
        hasSession: Boolean(input.sessions[group.folder]),
      }),
    };
  });
}

export function sortThreads(threads: AgentThread[]): AgentThread[] {
  return [...threads].sort((a, b) => {
    const stateRank = rankState(a.state) - rankState(b.state);
    if (stateRank !== 0) return stateRank;
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.title.localeCompare(b.title);
  });
}

export class AgentDashboardService {
  private readonly antigravityProvider: AntigravityProvider;
  private readonly registeredGroups: () => Record<string, RegisteredGroup>;
  private readonly sessions: () => Record<string, string>;
  private readonly queueSnapshot: () => Record<string, GroupQueueSnapshotEntry>;
  private readonly sendDirectiveToGroup?: (
    groupJid: string,
    text: string,
  ) => Promise<void>;

  constructor(input: {
    registeredGroups: () => Record<string, RegisteredGroup>;
    sessions: () => Record<string, string>;
    queueSnapshot: () => Record<string, GroupQueueSnapshotEntry>;
    antigravityProvider?: AntigravityProvider;
    sendDirectiveToGroup?: (groupJid: string, text: string) => Promise<void>;
  }) {
    this.registeredGroups = input.registeredGroups;
    this.sessions = input.sessions;
    this.queueSnapshot = input.queueSnapshot;
    this.antigravityProvider =
      input.antigravityProvider ?? new AntigravityProvider();
    this.sendDirectiveToGroup = input.sendDirectiveToGroup;
  }

  async getSnapshot(): Promise<AgentDashboardSnapshot> {
    const storedThreads = listAgentThreads();
    const existingThreads = new Map(storedThreads.map((thread) => [thread.id, thread]));
    const tasks = getAllTasks();
    const localThreads = buildLocalThreads({
      registeredGroups: this.registeredGroups(),
      sessions: this.sessions(),
      queueSnapshot: this.queueSnapshot(),
      tasks,
      existingThreads,
    });
    const antigravity = await this.antigravityProvider.getSnapshot();
    const liveThreadIds = new Set([
      ...localThreads.map((thread) => thread.id),
      ...antigravity.threads.map((thread) => thread.id),
    ]);
    const staleAntigravityThreadIds = storedThreads
      .filter(
        (thread) =>
          thread.provider === 'antigravity' && !liveThreadIds.has(thread.id),
      )
      .map((thread) => thread.id);

    deleteAgentThreads(staleAntigravityThreadIds);

    const persistedThreads = storedThreads.filter(
      (thread) =>
        thread.provider !== 'antigravity' && !liveThreadIds.has(thread.id),
    );
    const threads = sortThreads([
      ...localThreads,
      ...antigravity.threads,
      ...persistedThreads,
    ]).map((thread) => {
      const existing = getAgentThread(thread.id);
      const merged = {
        ...thread,
        desiredEffort: existing?.desiredEffort ?? thread.desiredEffort,
      };
      upsertAgentThread(merged);
      return merged;
    });
    const antigravityMappings = listAntigravityGroupMappings();

    const providers: AgentProviderHealth[] = [
      {
        provider: 'local',
        enabled: true,
        available: true,
        pollIntervalMs: WEBUI_REFRESH_INTERVAL,
        warnings: [],
      },
      antigravity.provider,
    ];

    return {
      updatedAt: new Date().toISOString(),
      refreshIntervalMs: Math.min(
        WEBUI_REFRESH_INTERVAL,
        antigravity.provider.pollIntervalMs || WEBUI_REFRESH_INTERVAL,
      ),
      warnings: [...antigravity.warnings],
      providers,
      antigravityProjects: antigravity.projects,
      antigravityMappings,
      threads,
    };
  }

  async requestEffortChange(
    threadId: string,
    targetEffort: 'low' | 'high',
  ): Promise<EffortChangeResult> {
    const thread = getAgentThread(threadId);

    if (!thread) {
      return {
        ok: false,
        threadId,
        targetEffort,
        message: `Unknown thread: ${threadId}`,
      };
    }

    setAgentThreadDesiredEffort(threadId, targetEffort);

    const result = await this.handleEffortChange(thread, targetEffort);

    recordAgentThreadAction({
      threadId,
      actionType:
        thread.provider === 'antigravity' && targetEffort === 'low'
          ? 'pullback_to_local'
          : thread.provider === 'local' && targetEffort === 'high'
            ? 'escalate_to_antigravity'
            : 'effort_change',
      targetEffort,
      status: result.ok ? 'accepted' : 'planned',
      note: result.message,
    });

    return result;
  }

  async setAntigravityMapping(
    groupJid: string,
    projectId: string,
  ): Promise<
    | { ok: true; mapping: AntigravityGroupMapping }
    | { ok: false; error: string }
  > {
    const group = this.registeredGroups()[groupJid];

    if (!group) {
      return { ok: false, error: `Unknown group: ${groupJid}` };
    }

    const antigravity = await this.antigravityProvider.getSnapshot(true);
    const project = antigravity.projects.find(
      (candidate) => candidate.projectId === projectId,
    );

    if (!project) {
      return {
        ok: false,
        error: `Unknown Antigravity project: ${projectId}`,
      };
    }

    return {
      ok: true,
      mapping: upsertAntigravityGroupMapping({
        groupJid,
        projectId: project.projectId,
        projectRef: project.projectRef,
        projectName: project.name,
      }),
    };
  }

  getThreadTimeline(threadId: string): AgentThreadTimeline {
    return {
      thread: getAgentThread(threadId) ?? null,
      actions: listAgentThreadActions(threadId),
    };
  }

  async getThreadInspector(threadId: string): Promise<AgentThreadInspector> {
    const thread = getAgentThread(threadId) ?? null;
    const actions = listAgentThreadActions(threadId);

    if (!thread) {
      return {
        thread: null,
        actions,
        summary: null,
        previewMessages: [],
        evidence: [],
      };
    }

    if (thread.provider === 'local') {
      return {
        thread,
        actions,
        ...this.buildLocalInspector(thread),
      };
    }

    const inspector = await this.antigravityProvider.getThreadInspector(thread);
    return {
      thread,
      actions,
      summary: inspector.summary,
      previewMessages: inspector.previewMessages,
      evidence: inspector.evidence,
    };
  }

  private async handleEffortChange(
    thread: AgentThread,
    targetEffort: 'low' | 'high',
  ): Promise<EffortChangeResult> {
    if (thread.provider === 'antigravity') {
      if (targetEffort === 'high') {
        return this.antigravityProvider.requestEffortChange(
          thread,
          targetEffort,
        );
      }
      return this.pullBackToLocal(thread, targetEffort);
    }

    if (targetEffort === 'low') {
      return {
        ok: true,
        threadId: thread.id,
        targetEffort,
        message: `${thread.title} is pinned to low-effort local execution.`,
      };
    }

    if (!thread.groupJid) {
      return {
        ok: false,
        threadId: thread.id,
        targetEffort,
        message: 'This local thread is not linked to a NanoClaw group.',
      };
    }

    const mapping = listAntigravityGroupMappings().find(
      (candidate) => candidate.groupJid === thread.groupJid,
    );

    if (!mapping) {
      return {
        ok: false,
        threadId: thread.id,
        targetEffort,
        message:
          'Map this NanoClaw group to an Antigravity project first, then retry the escalation.',
      };
    }

    const escalation = await this.antigravityProvider.createFollowupAgent({
      projectId: mapping.projectId,
      brief: [
        `Take over high-effort execution for the NanoClaw group "${thread.title}".`,
        `This request originated from NanoClaw thread ${thread.externalRef}.`,
        'Continue the work at a higher-effort Antigravity lane and report visible progress.',
      ].join(' '),
    });

    if (!escalation.ok) {
      return {
        ok: false,
        threadId: thread.id,
        targetEffort,
        message:
          escalation.warnings?.[0] ||
          'Antigravity escalation failed before a follow-up agent could be created.',
      };
    }

    if (escalation.data?.conversationRef) {
      upsertAgentThread({
        id: `antigravity:${escalation.data.conversationRef}`,
        provider: 'antigravity',
        externalRef: escalation.data.conversationRef,
        title: `${thread.title} (Antigravity)`,
        groupJid: thread.groupJid,
        effort: 'high',
        desiredEffort: null,
        state: 'running',
        lastSeenAt: new Date().toISOString(),
        metadataJson: JSON.stringify({
          sourceThreadId: thread.id,
          sourceGroupJid: thread.groupJid,
          projectId: mapping.projectId,
          projectRef: mapping.projectRef,
          projectName: mapping.projectName,
          conversationId: escalation.data.conversationId ?? null,
        }),
      });

      recordAgentThreadAction({
        threadId: `antigravity:${escalation.data.conversationRef}`,
        actionType: 'created_from_local_escalation',
        targetEffort: 'high',
        status: 'accepted',
        note: `Created from ${thread.title} using mapped project ${mapping.projectName}.`,
      });
    }

    return {
      ok: true,
      threadId: thread.id,
      targetEffort,
      message:
        escalation.data?.message ||
        `Escalated ${thread.title} to Antigravity project ${mapping.projectName}.`,
    };
  }

  private async pullBackToLocal(
    thread: AgentThread,
    targetEffort: 'low',
  ): Promise<EffortChangeResult> {
    const resolvedGroupJid = this.resolveThreadGroupJid(thread);

    if (!resolvedGroupJid) {
      return {
        ok: false,
        threadId: thread.id,
        targetEffort,
        message:
          'This Antigravity thread is not linked to a unique NanoClaw group yet, so it cannot be pulled back locally.',
      };
    }

    if (!this.sendDirectiveToGroup) {
      return {
        ok: false,
        threadId: thread.id,
        targetEffort,
        message:
          'Local pullback is not wired in this runtime because no directive sender is configured.',
      };
    }

    const meta = this.parseMetadata(thread.metadataJson);
    const projectName =
      typeof meta.projectName === 'string' ? meta.projectName : 'Antigravity';
    const projectRef =
      typeof meta.projectRef === 'string' ? meta.projectRef : 'unknown-project';
    const handoffContext =
      await this.antigravityProvider.buildPullbackContext(thread);
    const directive = [
      '@Andy resume this work locally.',
      `This task is being pulled back from Antigravity project "${projectName}".`,
      `Antigravity thread: ${thread.externalRef}.`,
      `Mapped project ref: ${projectRef}.`,
      handoffContext ? `Handoff summary: ${handoffContext}` : null,
      'Continue with a low-effort local pass and summarize the next concrete action.',
    ]
      .filter(Boolean)
      .join(' ');

    await this.sendDirectiveToGroup(resolvedGroupJid, directive);

    return {
      ok: true,
      threadId: thread.id,
      targetEffort,
      message: `Pulled ${thread.title} back to local execution in ${resolvedGroupJid}.`,
    };
  }

  private resolveThreadGroupJid(thread: AgentThread): string | null {
    if (thread.groupJid) {
      return thread.groupJid;
    }

    const meta = this.parseMetadata(thread.metadataJson);
    if (
      typeof meta.sourceGroupJid === 'string' &&
      meta.sourceGroupJid.length > 0
    ) {
      return meta.sourceGroupJid;
    }

    if (typeof meta.projectRef === 'string' && meta.projectRef.length > 0) {
      const mappings = listAntigravityGroupMappings().filter(
        (mapping) => mapping.projectRef === meta.projectRef,
      );
      if (mappings.length === 1) {
        return mappings[0]!.groupJid;
      }
    }

    return null;
  }

  private parseMetadata(metadataJson: string | null): Record<string, unknown> {
    if (!metadataJson) return {};
    try {
      return JSON.parse(metadataJson) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private buildLocalInspector(thread: AgentThread): {
    summary: string | null;
    previewMessages: AgentThreadPreviewMessage[];
    evidence: AgentThreadEvidenceLink[];
  } {
    const history = getChatHistory(thread.externalRef, 50);
    const previewMessages = history.map((message) => ({
      role: (message.is_bot_message ? 'assistant' : 'user') as
        | 'assistant'
        | 'user',
      author: message.sender_name || message.sender || 'local',
      text: this.truncate(message.content, 4000),
      createdAt: message.timestamp || null,
    }));

    return {
      summary:
        previewMessages.length > 0
          ? `Showing ${previewMessages.length} locally stored message${previewMessages.length === 1 ? '' : 's'} for ${thread.title}.`
          : `No local transcript has been stored for ${thread.title} yet.`,
      previewMessages,
      evidence: [],
    };
  }

  private truncate(text: string, maxLength: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1)}...`;
  }
}
