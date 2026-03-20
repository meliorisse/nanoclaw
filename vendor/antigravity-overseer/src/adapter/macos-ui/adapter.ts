import path from "node:path";
import type { AppConfig } from "../../config/defaults.ts";
import type { DatabaseClient } from "../../db/client.ts";
import { readLatestBridgeSnapshot } from "../../bridge/store.ts";
import {
  enqueueBridgeCommand,
  waitForBridgeCommandResult
} from "../../bridge/commands.ts";
import { persistSnapshot } from "../core/evidence.ts";
import type { OverseerAdapter } from "../core/adapter.ts";
import type { WindowSession } from "../core/session.ts";
import { AdapterNotReadyError } from "../core/errors.ts";
import { parseBridgeSnapshotPayload } from "../parsing/bridge-snapshot-parser.ts";
import { parseConversationMessages } from "../parsing/conversation-parser.ts";
import { parseProjectList } from "../parsing/project-parser.ts";
import { parseStatusFromVisibleText } from "../parsing/status-parser.ts";
import { parseVisibleWindowFixture } from "../parsing/window-fixture-parser.ts";
import { createId } from "../../utils/ids.ts";
import type { Logger } from "../../utils/logger.ts";
import type { Conversation, Project } from "../../types/domain.ts";
import { Interaction } from "./interaction.ts";
import { Extraction } from "../legacy-macos-ui/extraction.ts";
import { Navigation } from "./navigation.ts";
import { Screenshots } from "../legacy-macos-ui/screenshots.ts";
import { detectUiState } from "./state-detector.ts";
import { WindowController } from "./window-controller.ts";

interface ParsedScreenContext {
  visibleText: string;
  fixture: ReturnType<typeof parseVisibleWindowFixture>;
  source: "extension-bridge" | "fixture" | "legacy-ui";
}

export class MacOSWindowUIAdapter implements OverseerAdapter {
  private static readonly bridgeActionTimeoutMs = 90_000;
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
    if (!this.config.extensionBridge.enabled) {
      await this.navigation.ensureAgentManagerVisible(this.session);
    }
    this.logger.debug("Adapter session attached", { windowTitle: this.session.windowTitle });
    return this.session;
  }

  private async readParsedScreen(): Promise<ParsedScreenContext> {
    if (this.config.visibleTextPath) {
      const visibleText = await this.extraction.getVisibleText();
      const fixture = parseVisibleWindowFixture(visibleText);
      return {
        visibleText,
        fixture,
        source: "fixture"
      };
    }

    const bridgeSnapshot = await readLatestBridgeSnapshot(this.config);
    if (bridgeSnapshot) {
      const visibleText = bridgeSnapshot.payload.visibleText ?? "";
      const fixture = parseBridgeSnapshotPayload(bridgeSnapshot.payload);
      return {
        visibleText,
        fixture,
        source: "extension-bridge"
      };
    }

    const visibleText = await this.extraction.getVisibleText();
    const fixture = parseVisibleWindowFixture(visibleText);
    return { visibleText, fixture, source: "legacy-ui" };
  }

  private async dispatchBridgeCommand(input:
    | {
        kind: "send_message";
        workspaceRef: string | null;
        workspaceTitle: string | null;
        conversationRef: string;
        conversationTitle: string;
        text: string;
        probeText: string;
      }
    | {
        kind: "create_followup_agent";
        projectRef: string;
        projectTitle: string;
        brief: string;
        probeText: string;
      }
    | {
        kind: "focus_conversation";
        workspaceRef: string | null;
        workspaceTitle: string | null;
        conversationRef: string;
        conversationTitle: string;
      }
  ) {
    const command = await enqueueBridgeCommand(this.config, input);
    const result = await waitForBridgeCommandResult(
      this.config,
      command.id,
      MacOSWindowUIAdapter.bridgeActionTimeoutMs
    );

    if (!result) {
      return {
        ok: false,
        message: `Timed out waiting for extension bridge command ${command.id}.`
      };
    }

    return {
      ok: result.ok,
      message: result.message,
      conversationRef: result.conversationRef,
      conversationTitle: result.conversationTitle,
      workspaceRef: result.workspaceRef,
      workspaceTitle: result.workspaceTitle
    };
  }

  private async waitForConversationFocus(
    conversationRef: string,
    conversationTitle: string
  ): Promise<ParsedScreenContext | null> {
    const deadline = Date.now() + 8_000;

    while (Date.now() < deadline) {
      const screen = await this.readParsedScreen();
      const activeConversation = screen.fixture.conversations.find(
        (conversation) => conversation.conversationRef === screen.fixture.activeConversationRef
      );

      if (
        screen.fixture.activeConversationRef === conversationRef ||
        activeConversation?.conversationTitle === conversationTitle
      ) {
        return screen;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return null;
  }

  private async ensureConversationVisible(
    conversationRef: string,
    conversationTitle: string,
    projectRef: string | null,
    projectTitle: string | null
  ): Promise<ParsedScreenContext | null> {
    const screen = await this.readParsedScreen();
    const activeConversation = screen.fixture.conversations.find(
      (conversation) => conversation.conversationRef === screen.fixture.activeConversationRef
    );

    if (
      screen.fixture.activeConversationRef === conversationRef ||
      activeConversation?.conversationTitle === conversationTitle
    ) {
      return screen;
    }

    const focusResult = await this.dispatchBridgeCommand({
      kind: "focus_conversation",
      workspaceRef: projectRef,
      workspaceTitle: projectTitle,
      conversationRef,
      conversationTitle
    });

    if (!focusResult.ok) {
      return null;
    }

    return await this.waitForConversationFocus(conversationRef, conversationTitle);
  }

  async listProjects() {
    const { visibleText, fixture, source } = await this.readParsedScreen();
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
      confidence:
        source === "extension-bridge"
          ? Math.max(0.95, evidence.snapshot.confidence)
          : source === "fixture"
            ? Math.max(0.85, evidence.snapshot.confidence)
          : evidence.snapshot.confidence,
      evidence: evidence.evidence,
      warnings: [...fixture.warnings, ...evidence.warnings]
    };
  }

  async listConversations(projectRef: string) {
    const { visibleText, fixture, source } = await this.readParsedScreen();
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
      confidence:
        source === "extension-bridge"
          ? 0.95
          : source === "fixture"
            ? fixtureConversations.length > 0
              ? 0.88
              : Math.min(0.7, fallbackStatus.confidence)
          : fixtureConversations.length > 0
            ? Math.min(0.85, evidence.snapshot.confidence)
            : Math.min(0.65, fallbackStatus.confidence),
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

  async getConversation(
    conversationRef: string,
    options?: {
      conversationTitle?: string | null;
      projectRef?: string | null;
      projectTitle?: string | null;
    }
  ) {
    let screen = await this.readParsedScreen();
    let { visibleText, fixture, source } = screen;
    let visibleConversation = fixture.conversations.find(
      (conversation) => conversation.conversationRef === conversationRef
    );
    const requestedConversationTitle =
      options?.conversationTitle?.trim() ||
      visibleConversation?.conversationTitle ||
      path.basename(conversationRef);
    const requestedProjectRef =
      options?.projectRef ??
      visibleConversation?.projectRef ??
      conversationRef.split(":")[0] ??
      null;
    const requestedProjectTitle =
      options?.projectTitle?.trim() ||
      fixture.projects.find((project) => project.projectRef === requestedProjectRef)?.projectName ||
      visibleConversation?.projectName ||
      null;

    if (source === "extension-bridge") {
      const activeConversation = fixture.conversations.find(
        (conversation) => conversation.conversationRef === fixture.activeConversationRef
      );
      if (!visibleConversation || activeConversation?.conversationRef !== conversationRef) {
        const focusedScreen = await this.ensureConversationVisible(
          conversationRef,
          requestedConversationTitle,
          requestedProjectRef,
          requestedProjectTitle
        );

        if (focusedScreen) {
          screen = focusedScreen;
          ({ visibleText, fixture, source } = screen);
          visibleConversation = fixture.conversations.find(
            (conversation) => conversation.conversationRef === conversationRef
          );
        }
      }
    }

    const activeConversation = fixture.conversations.find(
      (conversation) => conversation.conversationRef === fixture.activeConversationRef
    );
    const canTrustVisibleTextFallback =
      source !== "extension-bridge" ||
      Boolean(
        visibleConversation &&
          activeConversation &&
          activeConversation.conversationRef === conversationRef
      );
    const messages = visibleConversation?.messages ??
      (canTrustVisibleTextFallback ? parseConversationMessages(visibleText) : []);
    const status = visibleConversation
      ? { status: visibleConversation.status, confidence: 0.86, cues: ["structured_fixture"] }
      : parseStatusFromVisibleText(visibleText);
    const evidence = await this.captureEvidence({});

    return {
      ok: true,
      data: {
        conversationRef,
        title: visibleConversation?.conversationTitle ?? requestedConversationTitle,
        status: status.status,
        messages,
        confidence:
          source === "extension-bridge"
            ? 0.97
            : source === "fixture"
              ? Math.max(0.9, status.confidence)
              : status.confidence
      },
      confidence:
        source === "extension-bridge"
          ? 0.97
          : source === "fixture"
            ? Math.max(0.9, status.confidence)
            : status.confidence,
      evidence: evidence.evidence,
      warnings: [
        ...fixture.warnings,
        ...evidence.warnings,
        ...(source === "extension-bridge" && !canTrustVisibleTextFallback && !visibleConversation
          ? [
              `Requested conversation ${conversationRef} is not the currently confirmed active Antigravity thread, so raw visible text was not reused as a fallback.`
            ]
          : [])
      ]
    };
  }

  async getStatus(conversationRef: string) {
    const { visibleText, fixture, source } = await this.readParsedScreen();
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
      confidence:
        source === "extension-bridge"
          ? 0.96
          : source === "fixture"
            ? Math.max(0.9, status.confidence)
            : status.confidence,
      evidence: evidence.evidence,
      warnings: [...fixture.warnings, ...evidence.warnings]
    };
  }

  async getScreenOverview() {
    const { fixture, source } = await this.readParsedScreen();
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
      confidence:
        source === "extension-bridge"
          ? Math.max(0.95, evidence.snapshot.confidence)
          : source === "fixture"
            ? Math.max(0.88, evidence.snapshot.confidence)
          : evidence.snapshot.confidence,
      evidence: evidence.evidence,
      warnings: [...fixture.warnings, ...evidence.warnings]
    };
  }

  async captureEvidence(input: { projectId?: string | null; conversationId?: string | null; taskId?: string | null }) {
    const { visibleText, source } = await this.readParsedScreen();
    const detected = detectUiState(visibleText);
    const screenshotPath =
      source === "legacy-ui"
        ? await this.screenshots.capture("visible-window", visibleText)
        : null;
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
          : source === "legacy-ui"
            ? ["Using archived legacy UI extraction path."]
            : []
    };
  }

  async sendMessage(input: {
    conversationRef: string;
    conversationTitle?: string | null;
    projectRef?: string | null;
    projectTitle?: string | null;
    text: string;
  }) {
    const preEvidence = await this.captureEvidence({});
    const { fixture, source } = await this.readParsedScreen();
    const visibleConversation = fixture.conversations.find(
      (conversation) => conversation.conversationRef === input.conversationRef
    );
    const requestedConversationTitle =
      input.conversationTitle?.trim() ||
      visibleConversation?.conversationTitle ||
      path.basename(input.conversationRef);
    const requestedProjectRef =
      input.projectRef ??
      visibleConversation?.projectRef ??
      input.conversationRef.split(":")[0] ??
      null;
    const requestedProjectTitle =
      input.projectTitle?.trim() ||
      visibleConversation?.projectName ||
      fixture.projects.find((project) => project.projectRef === requestedProjectRef)?.projectName ||
      null;

    if (source === "extension-bridge") {
      const bridgeResult = await this.dispatchBridgeCommand({
        kind: "send_message",
        workspaceRef: requestedProjectRef,
        workspaceTitle: requestedProjectTitle,
        conversationRef: input.conversationRef,
        conversationTitle: requestedConversationTitle,
        text: input.text,
        probeText: input.text.trim().split(/\r?\n/)[0] ?? input.text.trim()
      });
      const postEvidence = await this.captureEvidence({});

      return {
        ok: bridgeResult.ok,
        data: {
          delivered: bridgeResult.ok,
          message: bridgeResult.message
        },
        confidence: bridgeResult.ok ? 0.92 : 0.2,
        evidence: [...preEvidence.evidence, ...postEvidence.evidence],
        warnings: [...preEvidence.warnings, ...postEvidence.warnings]
      };
    }

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
    const evidence = await this.captureEvidence({ taskId: input.parentTaskId ?? null });
    const { fixture, source } = await this.readParsedScreen();
    const visibleProject = fixture.projects.find((project) => project.projectRef === input.projectRef);

    if (source === "extension-bridge") {
      const bridgeResult = await this.dispatchBridgeCommand({
        kind: "create_followup_agent",
        projectRef: input.projectRef,
        projectTitle: visibleProject?.projectName ?? input.projectRef,
        brief: input.brief,
        probeText: input.brief.trim().split(/\r?\n/)[0] ?? input.brief.trim()
      });

      return {
        ok: bridgeResult.ok,
        data: {
          created: bridgeResult.ok,
          conversationRef:
            bridgeResult.conversationRef ??
            (bridgeResult.ok ? `${input.projectRef}:followup:${createId("conv")}` : null),
          conversationTitle: bridgeResult.conversationTitle ?? null,
          message: bridgeResult.message
        },
        confidence: bridgeResult.ok ? 0.9 : 0.2,
        evidence: evidence.evidence,
        warnings: evidence.warnings
      };
    }

    const conversationRef = `${input.projectRef}:followup:${createId("conv")}`;

    return {
      ok: true,
      data: {
        created: true,
        conversationRef,
        conversationTitle: "Follow-up Agent",
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
