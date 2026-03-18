import type { ConversationMessage } from "../../types/domain.ts";
import { createId } from "../../utils/ids.ts";
import { splitBlocks } from "./normalization.ts";

export function parseConversationMessages(visibleText: string): ConversationMessage[] {
  return splitBlocks(visibleText).map((block) => {
    const [firstLine, ...rest] = block.split("\n");
    const match = firstLine.match(/^(system|user|assistant|supervisor):\s*(.*)$/i);

    if (match) {
      return {
        id: createId("msg"),
        role: match[1].toLowerCase() as ConversationMessage["role"],
        text: [match[2], ...rest].filter(Boolean).join("\n").trim(),
        createdAt: null
      };
    }

    return {
      id: createId("msg"),
      role: "unknown",
      text: block,
      createdAt: null
    };
  });
}
