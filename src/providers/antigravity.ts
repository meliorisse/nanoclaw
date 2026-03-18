import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import {
  ANTIGRAVITY_ENABLED,
  ANTIGRAVITY_MCP_ENTRY,
  ANTIGRAVITY_OVERSEER_DIR,
  ANTIGRAVITY_POLL_INTERVAL,
} from '../config.js';
import { logger } from '../logger.js';
import {
  AgentProviderHealth,
  AntigravityProjectOption,
  AgentThreadEvidenceLink,
  AgentThreadPreviewMessage,
  AgentThread,
  AgentThreadState,
  EffortChangeResult,
} from '../types.js';

const execFileAsync = promisify(execFile);

interface AntigravityOverviewResponse {
  ok: boolean;
  data?: {
    activeConversationRef: string | null;
    projects: Array<{
      projectId: string | null;
      projectRef: string;
      name: string;
      conversations: Array<{
        conversationRef: string;
        conversationId?: string | null;
        title: string;
        status: string;
      }>;
    }>;
  };
  warnings?: string[];
}

interface AntigravityCreateFollowupResponse {
  ok: boolean;
  data?: {
    created?: boolean;
    conversationRef?: string | null;
    conversationId?: string | null;
    message?: string;
  } | null;
  warnings?: string[];
}

interface AntigravityOperationalReportResponse {
  ok: boolean;
  data?: {
    warnings?: string[];
  };
  warnings?: string[];
}

interface AntigravityConversationResponse {
  ok: boolean;
  data?: {
    conversationId?: string;
    conversationRef: string;
    title: string;
    status: string;
    messages: Array<{
      role: string;
      text: string;
    }>;
  } | null;
  evidence?: Array<{
    snapshotId?: string;
    eventId?: string;
    filePath?: string;
  }>;
  warnings?: string[];
}

interface AntigravityListTasksResponse {
  ok: boolean;
  data?: Array<{
    id: string;
    primaryConversationId: string | null;
  }>;
  warnings?: string[];
}

interface AntigravityTaskSummaryResponse {
  ok: boolean;
  data?: {
    summary: string;
    latestSnapshotExcerpt?: string | null;
  } | null;
  warnings?: string[];
}

export interface AntigravityThreadInspector {
  summary: string | null;
  previewMessages: AgentThreadPreviewMessage[];
  evidence: AgentThreadEvidenceLink[];
}

export interface AntigravitySnapshot {
  provider: AgentProviderHealth;
  projects: AntigravityProjectOption[];
  threads: AgentThread[];
  warnings: string[];
}

export function extractTrailingJson(stdout: string): string {
  const trimmed = stdout.trim();
  const candidateOffsets = [
    trimmed.indexOf('{'),
    trimmed.lastIndexOf('\n{') >= 0 ? trimmed.lastIndexOf('\n{') + 1 : -1,
  ].filter(
    (offset, index, values) => offset >= 0 && values.indexOf(offset) === index,
  );

  for (const offset of candidateOffsets) {
    const candidate = trimmed.slice(offset).trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // keep trying
    }
  }

  return trimmed;
}

function buildDisabledSnapshot(reason?: string): AntigravitySnapshot {
  const warnings = reason ? [reason] : [];

  return {
    provider: {
      provider: 'antigravity',
      enabled: ANTIGRAVITY_ENABLED,
      available: false,
      pollIntervalMs: ANTIGRAVITY_POLL_INTERVAL,
      warnings,
    },
    projects: [],
    threads: [],
    warnings,
  };
}

export class AntigravityProvider {
  private cache:
    | {
        expiresAt: number;
        snapshot: AntigravitySnapshot;
      }
    | undefined;

  private async runTool<T>(
    tool: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const entry = path.join(ANTIGRAVITY_OVERSEER_DIR, ANTIGRAVITY_MCP_ENTRY);

    const { stdout } = await execFileAsync(
      process.execPath,
      ['--experimental-strip-types', entry, tool, JSON.stringify(args)],
      {
        cwd: ANTIGRAVITY_OVERSEER_DIR,
        timeout: 5000,
        env: {
          ...process.env,
          OVERSEER_LOG_LEVEL: process.env.OVERSEER_LOG_LEVEL || 'error',
        },
      },
    );

    return JSON.parse(extractTrailingJson(stdout)) as T;
  }

  async getSnapshot(force = false): Promise<AntigravitySnapshot> {
    if (!ANTIGRAVITY_ENABLED) {
      return buildDisabledSnapshot(
        'Antigravity add-on is disabled. Set ANTIGRAVITY_ENABLED=true to enable it.',
      );
    }

    if (!fs.existsSync(ANTIGRAVITY_OVERSEER_DIR)) {
      return buildDisabledSnapshot(
        `Antigravity repo not found at ${ANTIGRAVITY_OVERSEER_DIR}.`,
      );
    }

    if (!force && this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.snapshot;
    }

    try {
      const [overview, report] = await Promise.all([
        this.runTool<AntigravityOverviewResponse>('get_screen_overview'),
        this.runTool<AntigravityOperationalReportResponse>(
          'get_operational_report',
        ),
      ]);

      const warnings = [
        ...(overview.warnings || []),
        ...(report.warnings || []),
      ];
      const activeRef = overview.data?.activeConversationRef || null;
      const projects =
        overview.data?.projects
          .filter(
            (project): project is typeof project & { projectId: string } =>
              typeof project.projectId === 'string' &&
              project.projectId.length > 0,
          )
          .map((project) => ({
            projectId: project.projectId,
            projectRef: project.projectRef,
            name: project.name,
          })) || [];
      const threads =
        overview.data?.projects.flatMap((project) =>
          project.conversations.map((conversation) => {
            const state: AgentThreadState =
              activeRef === conversation.conversationRef
                ? 'running'
                : conversation.status === 'active'
                  ? 'waiting'
                  : 'idle';

            return {
              id: `antigravity:${conversation.conversationRef}`,
              provider: 'antigravity' as const,
              externalRef: conversation.conversationRef,
              title: conversation.title,
              groupJid: null,
              effort: 'high' as const,
              desiredEffort: null,
              state,
              lastSeenAt: new Date().toISOString(),
              metadataJson: JSON.stringify({
                projectId: project.projectId ?? null,
                projectRef: project.projectRef,
                projectName: project.name,
                conversationId: conversation.conversationId ?? null,
              }),
            };
          }),
        ) || [];

      const snapshot: AntigravitySnapshot = {
        provider: {
          provider: 'antigravity',
          enabled: true,
          available: overview.ok,
          pollIntervalMs: ANTIGRAVITY_POLL_INTERVAL,
          warnings,
        },
        projects,
        threads,
        warnings,
      };

      this.cache = {
        expiresAt: Date.now() + ANTIGRAVITY_POLL_INTERVAL,
        snapshot,
      };

      return snapshot;
    } catch (err) {
      logger.warn({ err }, 'Antigravity provider snapshot failed');
      return buildDisabledSnapshot(
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async requestEffortChange(
    thread: AgentThread,
    targetEffort: 'low' | 'high',
  ): Promise<EffortChangeResult> {
    if (thread.effort === targetEffort) {
      return {
        ok: true,
        threadId: thread.id,
        targetEffort,
        message: `${thread.title} is already running at ${targetEffort} effort.`,
      };
    }

    if (!ANTIGRAVITY_ENABLED) {
      return {
        ok: false,
        threadId: thread.id,
        targetEffort,
        message:
          'Antigravity provider is not enabled yet. Enable the add-on and configure the overseer repo first.',
      };
    }

    return {
      ok: false,
      threadId: thread.id,
      targetEffort,
      message:
        'Effort changes are scaffolded, but live handoff still needs group-to-project mapping plus Antigravity write automation.',
    };
  }

  async createFollowupAgent(input: {
    projectId: string;
    brief: string;
  }): Promise<AntigravityCreateFollowupResponse> {
    if (!ANTIGRAVITY_ENABLED) {
      return {
        ok: false,
        data: null,
        warnings: ['Antigravity provider is disabled.'],
      };
    }

    try {
      return await this.runTool<AntigravityCreateFollowupResponse>(
        'create_followup_agent',
        {
          projectId: input.projectId,
          brief: input.brief,
        },
      );
    } catch (err) {
      logger.warn(
        { err, projectId: input.projectId },
        'Antigravity follow-up creation failed',
      );
      return {
        ok: false,
        data: null,
        warnings: [err instanceof Error ? err.message : String(err)],
      };
    }
  }

  async buildPullbackContext(thread: AgentThread): Promise<string | null> {
    const metadata = this.parseMetadata(thread.metadataJson);
    const conversationIdentifier =
      (typeof metadata.conversationId === 'string' &&
        metadata.conversationId) ||
      thread.externalRef;

    try {
      const conversation = await this.runTool<AntigravityConversationResponse>(
        'get_conversation',
        {
          conversationId: conversationIdentifier,
        },
      );

      const title = conversation.data?.title || thread.title;
      const latestUserMessage = [...(conversation.data?.messages || [])]
        .reverse()
        .find((message) => message.role === 'user')?.text;
      const latestAssistantMessage = [...(conversation.data?.messages || [])]
        .reverse()
        .find((message) => message.role === 'assistant')?.text;

      let taskSummaryText: string | null = null;
      const conversationId =
        (typeof metadata.conversationId === 'string' &&
          metadata.conversationId) ||
        conversation.data?.conversationId ||
        null;

      if (conversationId) {
        const tasks =
          await this.runTool<AntigravityListTasksResponse>('list_tasks');
        const task = tasks.data?.find(
          (candidate) => candidate.primaryConversationId === conversationId,
        );

        if (task?.id) {
          const summary = await this.runTool<AntigravityTaskSummaryResponse>(
            'get_task_summary',
            {
              taskId: task.id,
            },
          );
          taskSummaryText = summary.data?.summary || null;
        }
      }

      const parts = [
        `Antigravity thread: ${title}.`,
        taskSummaryText ? `Task summary: ${taskSummaryText}` : null,
        latestUserMessage
          ? `Latest user request: ${this.truncate(latestUserMessage, 260)}`
          : null,
        latestAssistantMessage
          ? `Latest Antigravity update: ${this.truncate(latestAssistantMessage, 360)}`
          : null,
      ].filter(Boolean);

      return parts.length > 0 ? parts.join(' ') : null;
    } catch (err) {
      logger.warn(
        { err, threadId: thread.id },
        'Failed to build Antigravity pullback context',
      );
      return null;
    }
  }

  async getThreadInspector(
    thread: AgentThread,
  ): Promise<AntigravityThreadInspector> {
    const metadata = this.parseMetadata(thread.metadataJson);
    const conversationIdentifier =
      (typeof metadata.conversationId === 'string' &&
        metadata.conversationId) ||
      thread.externalRef;

    try {
      const conversation = await this.runTool<AntigravityConversationResponse>(
        'get_conversation',
        {
          conversationId: conversationIdentifier,
        },
      );

      const previewMessages = (conversation.data?.messages || [])
        .slice(-6)
        .map((message) => ({
          role: (message.role === 'user' ||
          message.role === 'assistant' ||
          message.role === 'system'
            ? message.role
            : 'unknown') as AgentThreadPreviewMessage['role'],
          author:
            message.role === 'assistant'
              ? 'Antigravity'
              : message.role === 'user'
                ? 'User'
                : message.role,
          text: this.truncate(message.text, 500),
          createdAt: null,
        }));

      let summary: string | null = null;
      const conversationId =
        (typeof metadata.conversationId === 'string' &&
          metadata.conversationId) ||
        conversation.data?.conversationId ||
        null;

      if (conversationId) {
        const tasks =
          await this.runTool<AntigravityListTasksResponse>('list_tasks');
        const task = tasks.data?.find(
          (candidate) => candidate.primaryConversationId === conversationId,
        );

        if (task?.id) {
          const taskSummary =
            await this.runTool<AntigravityTaskSummaryResponse>(
              'get_task_summary',
              {
                taskId: task.id,
              },
            );

          summary =
            taskSummary.data?.summary ||
            taskSummary.data?.latestSnapshotExcerpt ||
            null;
        }
      }

      const evidence = (conversation.evidence || [])
        .filter(
          (
            item,
          ): item is {
            snapshotId?: string;
            eventId?: string;
            filePath: string;
          } => typeof item.filePath === 'string' && item.filePath.length > 0,
        )
        .map((item) => ({
          label: path.basename(item.filePath),
          path: item.filePath,
          kind: 'file' as const,
        }));

      return {
        summary,
        previewMessages,
        evidence,
      };
    } catch (err) {
      logger.warn(
        { err, threadId: thread.id },
        'Failed to build Antigravity thread inspector',
      );
      return {
        summary: null,
        previewMessages: [],
        evidence: [],
      };
    }
  }

  private parseMetadata(metadataJson: string | null): Record<string, unknown> {
    if (!metadataJson) return {};
    try {
      return JSON.parse(metadataJson) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private truncate(text: string, maxLength: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1)}...`;
  }
}
