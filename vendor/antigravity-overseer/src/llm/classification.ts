import type { LocalModelClient } from "./local-client.ts";

export async function classifyWithLocalModel(client: LocalModelClient, prompt: string) {
  return client.complete({ prompt: `Classify this visible text:\n${prompt}` });
}
