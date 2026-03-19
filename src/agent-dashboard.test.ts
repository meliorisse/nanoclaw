import { describe, expect, it, vi } from 'vitest';

import {
  _initTestDatabase,
  setRegisteredGroup,
  storeChatMetadata,
  storeMessage,
  upsertAgentThread,
} from './db.js';
import { buildLocalThreads, sortThreads } from './agent-dashboard.js';
import { extractTrailingJson } from './providers/antigravity.js';
import { AgentDashboardService } from './agent-dashboard.js';

describe('agent dashboard scaffolding', () => {
  it('builds provider-aware local threads from queue state', () => {
    const threads = buildLocalThreads({
      registeredGroups: {
        'dev@g.us': {
          name: 'Dev',
          folder: 'dev',
          trigger: '@Andy',
          added_at: '2026-03-18T00:00:00.000Z',
          hostMode: true,
        },
        'ops@g.us': {
          name: 'Ops',
          folder: 'ops',
          trigger: '@Andy',
          added_at: '2026-03-18T00:00:00.000Z',
        },
      },
      sessions: { dev: 'session-1' },
      queueSnapshot: {
        'dev@g.us': {
          groupJid: 'dev@g.us',
          active: true,
          idleWaiting: false,
          isTaskContainer: false,
          runningTaskId: null,
          pendingMessages: false,
          pendingTaskCount: 0,
          containerName: 'nanoclaw-host-dev',
          groupFolder: 'dev',
        },
        'ops@g.us': {
          groupJid: 'ops@g.us',
          active: false,
          idleWaiting: false,
          isTaskContainer: false,
          runningTaskId: null,
          pendingMessages: true,
          pendingTaskCount: 1,
          containerName: null,
          groupFolder: 'ops',
        },
      },
      tasks: [
        {
          id: 'task-1',
          group_folder: 'ops',
          chat_jid: 'ops@g.us',
          prompt: 'Deploy check',
          schedule_type: 'interval',
          schedule_value: '300000',
          context_mode: 'isolated',
          next_run: null,
          last_run: null,
          last_result: null,
          status: 'active',
          created_at: '2026-03-18T00:00:00.000Z',
        },
      ],
    });

    expect(threads).toHaveLength(2);
    expect(
      threads.find((thread) => thread.id === 'local:dev@g.us')?.state,
    ).toBe('running');
    expect(
      threads.find((thread) => thread.id === 'local:ops@g.us')?.state,
    ).toBe('queued');
  });

  it('sorts running threads ahead of idle ones', () => {
    const sorted = sortThreads([
      {
        id: 'b',
        provider: 'local',
        externalRef: 'b',
        title: 'Idle Thread',
        groupJid: 'b',
        effort: 'low',
        desiredEffort: null,
        state: 'idle',
        lastSeenAt: '2026-03-18T00:00:00.000Z',
        metadataJson: null,
      },
      {
        id: 'a',
        provider: 'antigravity',
        externalRef: 'a',
        title: 'Running Thread',
        groupJid: null,
        effort: 'high',
        desiredEffort: null,
        state: 'running',
        lastSeenAt: '2026-03-18T00:00:00.000Z',
        metadataJson: null,
      },
    ]);

    expect(sorted.map((thread) => thread.id)).toEqual(['a', 'b']);
  });

  it('extracts trailing json from mixed command output', () => {
    const raw = `[2026-03-18T00:00:00.000Z] INFO Attached bootstrap\n{\n  "ok": true,\n  "data": {\n    "warnings": []\n  }\n}`;
    expect(JSON.parse(extractTrailingJson(raw))).toEqual({
      ok: true,
      data: { warnings: [] },
    });
  });

  it('creates a mapped Antigravity escalation for a local thread', async () => {
    _initTestDatabase();
    setRegisteredGroup('dev@g.us', {
      name: 'Dev',
      folder: 'dev',
      trigger: '@Andy',
      added_at: '2026-03-18T00:00:00.000Z',
    });

    const fakeProvider = {
      async getSnapshot() {
        return {
          provider: {
            provider: 'antigravity' as const,
            enabled: true,
            available: true,
            pollIntervalMs: 2000,
            warnings: [],
          },
          projects: [
            {
              projectId: 'proj_1',
              projectRef: 'nanoclaw',
              name: 'NanoClaw',
            },
          ],
          threads: [],
          warnings: [],
        };
      },
      async requestEffortChange() {
        return {
          ok: false,
          threadId: 'unused',
          targetEffort: 'low' as const,
          message: 'unused',
        };
      },
      async createFollowupAgent() {
        return {
          ok: true,
          data: {
            created: true,
            conversationRef: 'nanoclaw:followup',
            conversationId: 'conv_followup',
            message: 'Follow-up agent created.',
          },
          warnings: [],
        };
      },
    };

    const service = new AgentDashboardService({
      registeredGroups: () => ({
        'dev@g.us': {
          name: 'Dev',
          folder: 'dev',
          trigger: '@Andy',
          added_at: '2026-03-18T00:00:00.000Z',
        },
      }),
      sessions: () => ({}),
      queueSnapshot: () => ({}),
      antigravityProvider: fakeProvider as any,
    });

    await service.getSnapshot();
    const mappingResult = await service.setAntigravityMapping(
      'dev@g.us',
      'proj_1',
    );
    expect(mappingResult.ok).toBe(true);

    const escalation = await service.requestEffortChange(
      'local:dev@g.us',
      'high',
    );
    expect(escalation.ok).toBe(true);
    expect(escalation.message).toMatch(/follow-up agent created/i);
    expect(
      service.getThreadTimeline('local:dev@g.us').actions[0]?.actionType,
    ).toBe('escalate_to_antigravity');
  });

  it('pulls an antigravity thread back to local with a directive', async () => {
    _initTestDatabase();
    const sent: Array<{ groupJid: string; text: string }> = [];
    setRegisteredGroup('dev@g.us', {
      name: 'Dev',
      folder: 'dev',
      trigger: '@Andy',
      added_at: '2026-03-18T00:00:00.000Z',
    });

    const fakeProvider = {
      async getSnapshot() {
        return {
          provider: {
            provider: 'antigravity' as const,
            enabled: true,
            available: true,
            pollIntervalMs: 2000,
            warnings: [],
          },
          projects: [
            {
              projectId: 'proj_1',
              projectRef: 'nanoclaw',
              name: 'NanoClaw',
            },
          ],
          threads: [
            {
              id: 'antigravity:nanoclaw:followup',
              provider: 'antigravity' as const,
              externalRef: 'nanoclaw:followup',
              title: 'Dev (Antigravity)',
              groupJid: 'dev@g.us',
              effort: 'high' as const,
              desiredEffort: null,
              state: 'running' as const,
              lastSeenAt: '2026-03-18T00:00:00.000Z',
              metadataJson: JSON.stringify({
                projectRef: 'nanoclaw',
                projectName: 'NanoClaw',
              }),
            },
          ],
          warnings: [],
        };
      },
      async requestEffortChange() {
        return {
          ok: false,
          threadId: 'unused',
          targetEffort: 'high' as const,
          message: 'unused',
        };
      },
      async createFollowupAgent() {
        return {
          ok: false,
          data: null,
          warnings: ['unused'],
        };
      },
      async buildPullbackContext() {
        return 'Task summary: fix the timeout path. Latest Antigravity update: host timeout already adjusted.';
      },
    };

    const service = new AgentDashboardService({
      registeredGroups: () => ({
        'dev@g.us': {
          name: 'Dev',
          folder: 'dev',
          trigger: '@Andy',
          added_at: '2026-03-18T00:00:00.000Z',
        },
      }),
      sessions: () => ({}),
      queueSnapshot: () => ({}),
      antigravityProvider: fakeProvider as any,
      sendDirectiveToGroup: async (groupJid, text) => {
        sent.push({ groupJid, text });
      },
    });

    await service.getSnapshot();
    const result = await service.requestEffortChange(
      'antigravity:nanoclaw:followup',
      'low',
    );

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.groupJid).toBe('dev@g.us');
    expect(sent[0]?.text).toMatch(/resume this work locally/i);
    expect(sent[0]?.text).toMatch(/Task summary: fix the timeout path/i);
    expect(
      service.getThreadTimeline('antigravity:nanoclaw:followup').actions[0]
        ?.actionType,
    ).toBe('pullback_to_local');
  });

  it('builds a local inspector from stored chat history', async () => {
    _initTestDatabase();
    setRegisteredGroup('dev@g.us', {
      name: 'Dev',
      folder: 'dev',
      trigger: '@Andy',
      added_at: '2026-03-18T00:00:00.000Z',
    });
    storeChatMetadata(
      'dev@g.us',
      '2026-03-18T00:00:00.000Z',
      'Dev',
      'test',
      true,
    );

    storeMessage({
      id: 'msg-1',
      chat_jid: 'dev@g.us',
      sender: 'user@local',
      sender_name: 'User',
      content: 'Can you take a quick pass on the timeout issue?',
      timestamp: '2026-03-18T00:00:01.000Z',
      is_from_me: false,
      is_bot_message: false,
    });
    storeMessage({
      id: 'msg-2',
      chat_jid: 'dev@g.us',
      sender: 'andy@local',
      sender_name: 'Andy',
      content: 'I am checking the timeout path and the last restart logs now.',
      timestamp: '2026-03-18T00:00:02.000Z',
      is_from_me: false,
      is_bot_message: true,
    });

    const service = new AgentDashboardService({
      registeredGroups: () => ({
        'dev@g.us': {
          name: 'Dev',
          folder: 'dev',
          trigger: '@Andy',
          added_at: '2026-03-18T00:00:00.000Z',
        },
      }),
      sessions: () => ({}),
      queueSnapshot: () => ({}),
      antigravityProvider: {
        async getSnapshot() {
          return {
            provider: {
              provider: 'antigravity' as const,
              enabled: true,
              available: false,
              pollIntervalMs: 2000,
              warnings: [],
            },
            projects: [],
            threads: [],
            warnings: [],
          };
        },
        async requestEffortChange() {
          return {
            ok: false,
            threadId: 'unused',
            targetEffort: 'high' as const,
            message: 'unused',
          };
        },
        async createFollowupAgent() {
          return {
            ok: false,
            data: null,
            warnings: ['unused'],
          };
        },
        async getThreadInspector() {
          return {
            summary: null,
            previewMessages: [],
            evidence: [],
          };
        },
      } as any,
    });

    await service.getSnapshot();
    const inspector = await service.getThreadInspector('local:dev@g.us');

    expect(inspector.thread?.id).toBe('local:dev@g.us');
    expect(inspector.previewMessages).toHaveLength(2);
    expect(inspector.previewMessages[0]?.author).toBe('User');
    expect(inspector.previewMessages[1]?.role).toBe('assistant');
    expect(inspector.summary).toMatch(/showing 2 locally stored messages/i);
  });

  it('surfaces antigravity transcript previews and evidence links', async () => {
    _initTestDatabase();
    const service = new AgentDashboardService({
      registeredGroups: () => ({}),
      sessions: () => ({}),
      queueSnapshot: () => ({}),
      antigravityProvider: {
        async getSnapshot() {
          return {
            provider: {
              provider: 'antigravity' as const,
              enabled: true,
              available: true,
              pollIntervalMs: 2000,
              warnings: [],
            },
            projects: [],
            threads: [
              {
                id: 'antigravity:nanoclaw:followup',
                provider: 'antigravity' as const,
                externalRef: 'nanoclaw:followup',
                title: 'Dev (Antigravity)',
                groupJid: 'dev@g.us',
                effort: 'high' as const,
                desiredEffort: null,
                state: 'running' as const,
                lastSeenAt: '2026-03-18T00:00:00.000Z',
                metadataJson: JSON.stringify({
                  projectRef: 'nanoclaw',
                  projectName: 'NanoClaw',
                  conversationId: 'conv_followup',
                }),
              },
            ],
            warnings: [],
          };
        },
        async requestEffortChange() {
          return {
            ok: false,
            threadId: 'unused',
            targetEffort: 'high' as const,
            message: 'unused',
          };
        },
        async createFollowupAgent() {
          return {
            ok: false,
            data: null,
            warnings: ['unused'],
          };
        },
        async getThreadInspector() {
          return {
            summary: 'Timeout fix is underway and evidence is attached.',
            previewMessages: [
              {
                role: 'user' as const,
                author: 'User',
                text: 'Please increase the timeout to ten minutes.',
                createdAt: null,
              },
              {
                role: 'assistant' as const,
                author: 'Antigravity',
                text: 'I updated both timeouts and restarted the service.',
                createdAt: null,
              },
            ],
            evidence: [
              {
                label: 'visible-window.png',
                path: '/tmp/visible-window.png',
                kind: 'file' as const,
              },
            ],
          };
        },
      } as any,
    });

    await service.getSnapshot();
    const inspector = await service.getThreadInspector(
      'antigravity:nanoclaw:followup',
    );

    expect(inspector.summary).toMatch(/evidence is attached/i);
    expect(inspector.previewMessages[1]?.author).toBe('Antigravity');
    expect(inspector.evidence[0]?.path).toBe('/tmp/visible-window.png');
  });

  it('sends messages directly to a selected antigravity thread', async () => {
    _initTestDatabase();
    const sendMessage = vi.fn<
      (thread: { id: string }, text: string) => Promise<void>
    >(async () => {});

    const service = new AgentDashboardService({
      registeredGroups: () => ({}),
      sessions: () => ({}),
      queueSnapshot: () => ({}),
      antigravityProvider: {
        async getSnapshot() {
          return {
            provider: {
              provider: 'antigravity' as const,
              enabled: true,
              available: true,
              pollIntervalMs: 2000,
              warnings: [],
            },
            projects: [],
            threads: [
              {
                id: 'antigravity:nanoclaw:followup',
                provider: 'antigravity' as const,
                externalRef: 'nanoclaw:followup',
                title: 'Debugging Agent Threads',
                groupJid: null,
                effort: 'high' as const,
                desiredEffort: null,
                state: 'waiting' as const,
                lastSeenAt: '2026-03-18T00:00:00.000Z',
                metadataJson: JSON.stringify({
                  conversationId: 'conv_followup',
                }),
              },
            ],
            warnings: [],
          };
        },
        async sendMessage(thread: { id: string }, text: string) {
          await sendMessage(thread, text);
          return {
            ok: true,
            threadId: thread.id,
            message: 'Sent to Antigravity thread "Debugging Agent Threads".',
          };
        },
      } as any,
    });

    await service.getSnapshot();
    const result = await service.sendThreadMessage(
      'antigravity:nanoclaw:followup',
      'Please continue debugging the queue refresh issue.',
    );

    expect(result.ok).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'antigravity:nanoclaw:followup',
      }),
      'Please continue debugging the queue refresh issue.',
    );
    expect(
      service.getThreadTimeline('antigravity:nanoclaw:followup').actions[0]
        ?.actionType,
    ).toBe('send_thread_message');
  });

  it('rejects messages to antigravity threads that are no longer visible', async () => {
    _initTestDatabase();

    upsertAgentThread({
      id: 'antigravity:nanoclaw:debugging-agent-threads',
      provider: 'antigravity',
      externalRef: 'nanoclaw:debugging-agent-threads',
      title: 'Debugging Agent Threads',
      groupJid: null,
      effort: 'high',
      desiredEffort: null,
      state: 'waiting',
      lastSeenAt: '2026-03-10T00:00:00.000Z',
      metadataJson: JSON.stringify({
        conversationId: 'conv_stale',
      }),
    });

    const sendMessage = vi.fn<
      (
        thread: { id: string },
        text: string,
      ) => Promise<{
        ok: true;
        threadId: string;
        message: string;
      }>
    >(async () => ({
      ok: true,
      threadId: 'antigravity:nanoclaw:debugging-agent-threads',
      message: 'unexpected',
    }));

    const service = new AgentDashboardService({
      registeredGroups: () => ({}),
      sessions: () => ({}),
      queueSnapshot: () => ({}),
      antigravityProvider: {
        async getSnapshot() {
          return {
            provider: {
              provider: 'antigravity' as const,
              enabled: true,
              available: true,
              pollIntervalMs: 2000,
              warnings: [],
            },
            projects: [],
            threads: [
              {
                id: 'antigravity:nanoclaw:configuring-container-m',
                provider: 'antigravity' as const,
                externalRef: 'nanoclaw:configuring-container-m',
                title: 'Configuring Container M....',
                groupJid: null,
                effort: 'high' as const,
                desiredEffort: null,
                state: 'idle' as const,
                lastSeenAt: '2026-03-18T00:00:00.000Z',
                metadataJson: JSON.stringify({
                  conversationId: 'conv_live',
                }),
              },
            ],
            warnings: [],
          };
        },
        async sendMessage(thread: { id: string }, text: string) {
          return sendMessage(thread, text);
        },
      } as any,
    });

    const result = await service.sendThreadMessage(
      'antigravity:nanoclaw:debugging-agent-threads',
      'if you can read this, please type BLAH and stop',
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain(
      'is not on the current Antigravity screen anymore',
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps recent antigravity threads and allows sending when the sidebar snapshot is temporarily sparse', async () => {
    _initTestDatabase();

    upsertAgentThread({
      id: 'antigravity:tge:sunomusic-remaster-redo',
      provider: 'antigravity',
      externalRef: 'tge:sunomusic-remaster-redo',
      title: 'Sunomusic Remaster Redo',
      groupJid: null,
      effort: 'high',
      desiredEffort: null,
      state: 'waiting',
      lastSeenAt: new Date().toISOString(),
      metadataJson: JSON.stringify({
        conversationId: 'conv_redo',
        projectRef: 'tge',
        projectName: 'TGE',
      }),
    });

    const sendMessage = vi.fn<
      (
        thread: { id: string; metadataJson: string | null },
        text: string,
      ) => Promise<{
        ok: true;
        threadId: string;
        message: string;
      }>
    >(async (thread) => ({
      ok: true,
      threadId: thread.id,
      message: 'Sent to Antigravity thread "Sunomusic Remaster Redo".',
    }));

    const service = new AgentDashboardService({
      registeredGroups: () => ({}),
      sessions: () => ({}),
      queueSnapshot: () => ({}),
      antigravityProvider: {
        async getSnapshot() {
          return {
            provider: {
              provider: 'antigravity' as const,
              enabled: true,
              available: true,
              pollIntervalMs: 2000,
              warnings: [],
            },
            projects: [],
            threads: [],
            warnings: [],
          };
        },
        async sendMessage(thread: { id: string; metadataJson: string | null }, text: string) {
          return sendMessage(thread, text);
        },
      } as any,
    });

    const snapshot = await service.getSnapshot();
    expect(
      snapshot.threads.some((thread) => thread.id === 'antigravity:tge:sunomusic-remaster-redo'),
    ).toBe(true);

    const result = await service.sendThreadMessage(
      'antigravity:tge:sunomusic-remaster-redo',
      'please continue checking the volume issue',
    );

    expect(result.ok).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'antigravity:tge:sunomusic-remaster-redo',
      }),
      'please continue checking the volume issue',
    );
  });

  it('prunes stale persisted antigravity threads when a live snapshot is available', async () => {
    _initTestDatabase();

    upsertAgentThread({
      id: 'antigravity:nanoclaw:fixing-host-mode-responses',
      provider: 'antigravity',
      externalRef: 'nanoclaw:fixing-host-mode-responses',
      title: 'Fixing Host Mode Responses',
      groupJid: null,
      effort: 'high',
      desiredEffort: null,
      state: 'running',
      lastSeenAt: '2026-03-10T00:00:00.000Z',
      metadataJson: null,
    });

    const service = new AgentDashboardService({
      registeredGroups: () => ({}),
      sessions: () => ({}),
      queueSnapshot: () => ({}),
      antigravityProvider: {
        async getSnapshot() {
          return {
            provider: {
              provider: 'antigravity' as const,
              enabled: true,
              available: true,
              pollIntervalMs: 2000,
              warnings: [],
            },
            projects: [],
            threads: [
              {
                id: 'antigravity:nanoclaw:debugging-agent-threads',
                provider: 'antigravity' as const,
                externalRef: 'nanoclaw:debugging-agent-threads',
                title: 'Debugging Agent Threads',
                groupJid: null,
                effort: 'high' as const,
                desiredEffort: null,
                state: 'waiting' as const,
                lastSeenAt: '2026-03-18T00:05:00.000Z',
                metadataJson: null,
              },
            ],
            warnings: [],
          };
        },
      } as any,
    });

    const snapshot = await service.getSnapshot();

    expect(
      snapshot.threads.map((thread) => `${thread.provider}:${thread.title}`),
    ).toEqual(['antigravity:Debugging Agent Threads']);
    expect(
      service.getThreadTimeline(
        'antigravity:nanoclaw:fixing-host-mode-responses',
      ).thread,
    ).toBeNull();
  });
});
