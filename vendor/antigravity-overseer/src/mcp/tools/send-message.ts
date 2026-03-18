import type { OverseerAdapter } from "../../adapter/core/adapter.ts";
import { ConversationsRepository } from "../../db/repositories/conversations.ts";
import { resolveConversationIdentifier } from "../resolvers.ts";

export async function sendMessageTool(
  adapter: OverseerAdapter,
  conversationsRepository: ConversationsRepository,
  input: { conversationId: string; text: string }
) {
  const conversation = resolveConversationIdentifier(conversationsRepository, input.conversationId);

  if (!conversation) {
    return {
      ok: false,
      data: null,
      confidence: 0,
      evidence: [],
      warnings: [`Unknown conversation: ${input.conversationId}`]
    };
  }

  return adapter.sendMessage({
    conversationRef: conversation.externalConversationRef,
    text: input.text
  });
}
