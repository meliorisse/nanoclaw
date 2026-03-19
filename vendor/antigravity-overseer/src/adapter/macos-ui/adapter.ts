import path from "node:path";
import type { AppConfig } from "../../config/defaults.ts";
import type { DatabaseClient } from "../../db/client.ts";
import { persistSnapshot } from "../core/evidence.ts";
import type { OverseerAdapter } from "../core/adapter.ts";
import type { WindowSession } from "../core/session.ts";
import { AdapterNotReadyError } from "../core/errors.ts";
import { parseConversationMessages } from "../parsing/conversation-parser.ts";
import { parseProjectList } from "../parsing/project-parser.ts";
import { parseStatusFromVisibleText } from "../parsing/status-parser.ts";
import { parseVisibleWindowFixture } from "../parsing/window-fixture-parser.ts";
import { createId } from "../../utils/ids.ts";
import type { Logger } from "../../utils/logger.ts";
import type { Conversation, Project } from "../../types/domain.ts";
import { runShellCommand, shellEscape } from "../../utils/shell.ts";
import { Extraction } from "./extraction.ts";
import { Interaction } from "./interaction.ts";
import { Navigation } from "./navigation.ts";
import { Screenshots } from "./screenshots.ts";
import { detectUiState } from "./state-detector.ts";
import { WindowController } from "./window-controller.ts";

interface ParsedScreenContext {
  visibleText: string;
  fixture: ReturnType<typeof parseVisibleWindowFixture>;
}

export class MacOSWindowUIAdapter implements OverseerAdapter {
  private readonly controller: WindowController;
  private readonly extraction: Extraction;
  private readonly navigation: Navigation;
  private readonly interaction: Interaction;
  private readonly screenshots: Screenshots;
  private readonly config: AppConfig;
  private readonly db: DatabaseClient;
  private readonly logger: Logger;
  private session: WindowSession | null = null;

  constructor(
    config: AppConfig,
    db: DatabaseClient,
    logger: Logger
  ) {
    this.config = config;
    this.db = db;
    this.logger = logger;
    this.controller = new WindowController(config, logger);
    this.extraction = new Extraction(config);
    this.navigation = new Navigation(logger);
    this.interaction = new Interaction(config, logger);
    this.screenshots = new Screenshots(config);
  }

  async attach(): Promise<WindowSession> {
    this.session = await this.controller.attach();
    await this.navigation.ensureAgentManagerVisible(this.session);
    this.logger.debug("Adapter session attached", { windowTitle: this.session.windowTitle });
    return this.session;
  }

  private async readParsedScreen(): Promise<ParsedScreenContext> {
    const visibleText = await this.extraction.getVisibleText();
    const fixture = parseVisibleWindowFixture(visibleText);
    return { visibleText, fixture };
  }

  async listProjects() {
    const { visibleText, fixture } = await this.readParsedScreen();
    const parsedProjects =
      fixture.projects.length > 0
        ? fixture.projects.map((project) => ({
            externalProjectRef: project.projectRef,
            name: project.projectName
          }))
        : parseProjectList(visibleText);
    const evidence = await this.captureEvidence({});
    const projects: Project[] = parsedProjects.map((project) => ({
      id: createId("proj"),
      externalProjectRef: project.externalProjectRef,
      name: project.name,
      lastSeenAt: evidence.snapshot.createdAt,
      metadataJson: null,
      createdAt: evidence.snapshot.createdAt,
      updatedAt: evidence.snapshot.createdAt
    }));

    return {
      ok: true,
      data: projects,
      confidence: evidence.snapshot.confidence,
      evidence: evidence.evidence,
      warnings: [...fixture.warnings, ...evidence.warnings]
    };
  }

  async listConversations(projectRef: string) {
    const { visibleText, fixture } = await this.readParsedScreen();
    const evidence = await this.captureEvidence({});
    const fallbackStatus = parseStatusFromVisibleText(visibleText);
    const fixtureConversations = fixture.conversations.filter(
      (conversation) => conversation.projectRef === projectRef
    );
    const conversations: Conversation[] =
      fixtureConversations.length > 0
        ? fixtureConversations.map((conversation) => ({
            id: createId("conv"),
            projectId: projectRef,
            externalConversationRef: conversation.conversationRef,
            title: conversation.conversationTitle,
            status: conversation.status,
            lastMessageAt: conversation.lastMessageAt,
            lastSeenAt: evidence.snapshot.createdAt,
            createdAt: evidence.snapshot.createdAt,
            updatedAt: evidence.snapshot.createdAt
          }))
        : parseConversationMessages(visibleText).map((message, index) => ({
            id: createId("conv"),
            projectId: projectRef,
            externalConversationRef: `${projectRef}:${index + 1}`,
            title: `${message.role} thread ${index + 1}`,
            status: fallbackStatus.status,
            lastMessageAt: null,
            lastSeenAt: evidence.snapshot.createdAt,
            createdAt: evidence.snapshot.createdAt,
            updatedAt: evidence.snapshot.createdAt
          }));

    return {
      ok: true,
      data: conversations,
      confidence: fixtureConversations.length > 0 ? Math.min(0.85, evidence.snapshot.confidence) : Math.min(0.65, fallbackStatus.confidence),
      evidence: evidence.evidence,
      warnings: [
        ...fixture.warnings,
        ...evidence.warnings,
        ...(fixtureConversations.length > 0
          ? []
          : ["Conversation list is inferred from visible text blocks until real navigation is integrated."])
      ]
    };
  }

  async getConversation(conversationRef: string) {
    const { visibleText, fixture } = await this.readParsedScreen();
    const visibleConversation = fixture.conversations.find(
      (conversation) => conversation.conversationRef === conversationRef
    );
    const messages = visibleConversation?.messages ?? parseConversationMessages(visibleText);
    const status = visibleConversation
      ? { status: visibleConversation.status, confidence: 0.86, cues: ["structured_fixture"] }
      : parseStatusFromVisibleText(visibleText);
    const evidence = await this.captureEvidence({});

    return {
      ok: true,
      data: {
        conversationRef,
        title: visibleConversation?.conversationTitle ?? path.basename(conversationRef),
        status: status.status,
        messages,
        confidence: status.confidence
      },
      confidence: status.confidence,
      evidence: evidence.evidence,
      warnings: [...fixture.warnings, ...evidence.warnings]
    };
  }

  async getStatus(conversationRef: string) {
    const { visibleText, fixture } = await this.readParsedScreen();
    const visibleConversation = fixture.conversations.find(
      (conversation) => conversation.conversationRef === conversationRef
    );
    const status = visibleConversation
      ? { status: visibleConversation.status, confidence: 0.86, cues: ["structured_fixture"] }
      : parseStatusFromVisibleText(visibleText);
    const evidence = await this.captureEvidence({});

    return {
      ok: true,
      data: {
        status: status.status,
        cues: status.cues
      },
      confidence: status.confidence,
      evidence: evidence.evidence,
      warnings: [...fixture.warnings, ...evidence.warnings]
    };
  }

  async getScreenOverview() {
    const { fixture } = await this.readParsedScreen();
    const evidence = await this.captureEvidence({});
    const activeConversation = fixture.activeConversationRef
      ? fixture.conversations.find((conversation) => conversation.conversationRef === fixture.activeConversationRef)
      : undefined;

    return {
      ok: true,
      data: {
        projects: fixture.projects.map((project) => ({
          projectRef: project.projectRef,
          name: project.projectName,
          conversations: fixture.conversations
            .filter((conversation) => conversation.projectRef === project.projectRef)
            .map((conversation) => ({
              projectRef: conversation.projectRef,
              conversationRef: conversation.conversationRef,
              title: conversation.conversationTitle,
              status: conversation.status
            }))
        })),
        activeConversationRef: fixture.activeConversationRef,
        activeConversationTitle: activeConversation?.conversationTitle ?? null
      },
      confidence: evidence.snapshot.confidence,
      evidence: evidence.evidence,
      warnings: [...fixture.warnings, ...evidence.warnings]
    };
  }

  async captureEvidence(input: { projectId?: string | null; conversationId?: string | null; taskId?: string | null }) {
    const visibleText = await this.extraction.getVisibleText();
    const detected = detectUiState(visibleText);
    const screenshotPath = await this.screenshots.capture("visible-window", visibleText);
    const snapshot = persistSnapshot(this.db, {
      projectId: input.projectId ?? null,
      conversationId: input.conversationId ?? null,
      taskId: input.taskId ?? null,
      screenshotPath,
      extractedText: visibleText,
      uiState: detected.uiState,
      confidence: detected.confidence
    });

    return {
      snapshot,
      evidence: [{ snapshotId: snapshot.id, filePath: snapshot.screenshotPath ?? undefined }],
      warnings:
        visibleText.length === 0
          ? ["No visible text fixture configured; confidence is intentionally low."]
          : []
    };
  }

  async sendMessage(input: { conversationRef: string; text: string }) {
    const preEvidence = await this.captureEvidence({});

    try {
      await this.interaction.sendMessage(input.text);
    } catch (error) {
      if (error instanceof AdapterNotReadyError) {
        return {
          ok: false,
          data: {
            delivered: false,
            message: error.message
          },
          confidence: 0.1,
          evidence: preEvidence.evidence,
          warnings: [
            ...preEvidence.warnings,
            `Conversation ${input.conversationRef} was not written because visible confirmation is not yet available.`
          ]
        };
      }

      throw error;
    }

    const postEvidence = await this.captureEvidence({});

    return {
      ok: true,
      data: {
        delivered: true,
        message: "Stub message path executed. Replace with real UI confirmation before production use."
      },
      confidence: 0.32,
      evidence: [...preEvidence.evidence, ...postEvidence.evidence],
      warnings: [...preEvidence.warnings, ...postEvidence.warnings]
    };
  }

  async createFollowupAgent(input: {
    projectRef: string;
    brief: string;
    parentTaskId?: string | null;
  }) {
    if (this.config.screenSource.textCommand) {
      try {
        const stdout = await runShellCommand(
          `${this.config.screenSource.textCommand} --launch-brief ${shellEscape(input.brief)} --project-title ${shellEscape(input.projectRef)}`
        );
        const evidence = await this.captureEvidence({ taskId: input.parentTaskId ?? null });
        const conversationRef = `${input.projectRef}:followup:${createId("conv")}`;

        return {
          ok: true,
          data: {
            created: true,
            conversationRef,
            message:
              stdout.trim() === "launched"
                ? "Started a new Antigravity conversation through the live UI."
                : "Launched a new Antigravity conversation through the live UI."
          },
          confidence: 0.74,
          evidence: evidence.evidence,
          warnings: evidence.warnings
        };
      } catch (error) {
        const evidence = await this.captureEvidence({ taskId: input.parentTaskId ?? null });
        return {
          ok: false,
          data: {
            created: false,
            conversationRef: null,
            message: error instanceof Error ? error.message : String(error)
          },
          confidence: 0.22,
          evidence: evidence.evidence,
          warnings: [
            ...evidence.warnings,
            "Antigravity follow-up launch failed before the UI could confirm a new conversation."
          ]
        };
      }
    }

    const evidence = await this.captureEvidence({ taskId: input.parentTaskId ?? null });
    const conversationRef = `${input.projectRef}:followup:${createId("conv")}`;

    return {
      ok: true,
      data: {
        created: true,
        conversationRef,
        message: "Follow-up workflow recorded locally. Replace with a real UI initiation path before production use."
      },
      confidence: 0.42,
      evidence: evidence.evidence,
      warnings: [
        ...evidence.warnings,
        "Follow-up agent creation is currently ledger-backed and evidence-backed, but not yet driven by concrete UI automation."
      ]
    };
  }
}
