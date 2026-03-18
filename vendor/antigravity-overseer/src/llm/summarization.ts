import type { LocalModelClient } from "./local-client.ts";

export async function summarizeWithLocalModel(client: LocalModelClient, prompt: string) {
  return client.complete({ prompt: `Summarize this conversation delta:\n${prompt}` });
}
