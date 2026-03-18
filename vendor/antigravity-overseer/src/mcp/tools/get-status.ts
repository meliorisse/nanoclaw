import type { OverseerAdapter } from "../../adapter/core/adapter.ts";
import { ConversationsRepository } from "../../db/repositories/conversations.ts";
import { resolveConversationIdentifier } from "../resolvers.ts";

export async function getStatusTool(
  adapter: OverseerAdapter,
  conversationsRepository: ConversationsRepository,
  conversationIdentifier: string
) {
  const conversation = resolveConversationIdentifier(conversationsRepository, conversationIdentifier);

  if (!conversation) {
    return {
      ok: false,
      data: null,
      confidence: 0,
      evidence: [],
      warnings: [`Unknown conversation: ${conversationIdentifier}`]
    };
  }

  return adapter.getStatus(conversation.externalConversationRef);
}
