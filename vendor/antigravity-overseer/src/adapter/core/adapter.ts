import type { Conversation, ConversationMessage, Project } from "../../types/domain.ts";
import type { EvidenceCaptureResult } from "../../types/evidence.ts";
import type { ToolResult } from "../../types/tool-results.ts";
import type { WindowSession } from "./session.ts";

export interface AdapterConversationView {
  conversationRef: string;
  title: string;
  status: Conversation["status"];
  messages: ConversationMessage[];
  confidence: number;
}

export interface AdapterProjectView {
  projects: Project[];
  confidence: number;
}

export interface SendMessageResult {
  delivered: boolean;
  message: string;
}

export interface CreateFollowupAgentResult {
  created: boolean;
  conversationRef: string | null;
  conversationTitle?: string | null;
  message: string;
}

export interface ScreenOverviewConversation {
  projectRef: string;
  conversationRef: string;
  title: string;
  status: Conversation["status"];
}

export interface ScreenOverviewProject {
  projectRef: string;
  name: string;
  conversations: ScreenOverviewConversation[];
}

export interface ScreenOverviewResult {
  projects: ScreenOverviewProject[];
  activeConversationRef: string | null;
  activeConversationTitle: string | null;
}

export interface OverseerAdapter {
  attach(): Promise<WindowSession>;
  listProjects(): Promise<ToolResult<Project[]>>;
  listConversations(projectRef: string): Promise<ToolResult<Conversation[]>>;
  getConversation(conversationRef: string): Promise<ToolResult<AdapterConversationView>>;
  getStatus(conversationRef: string): Promise<ToolResult<{ status: Conversation["status"]; cues: string[] }>>;
  getScreenOverview(): Promise<ToolResult<ScreenOverviewResult>>;
  captureEvidence(input: {
    projectId?: string | null;
    conversationId?: string | null;
    taskId?: string | null;
  }): Promise<EvidenceCaptureResult>;
  sendMessage(input: {
    conversationRef: string;
    text: string;
  }): Promise<ToolResult<SendMessageResult>>;
  createFollowupAgent(input: {
    projectRef: string;
    brief: string;
    parentTaskId?: string | null;
  }): Promise<ToolResult<CreateFollowupAgentResult>>;
}
