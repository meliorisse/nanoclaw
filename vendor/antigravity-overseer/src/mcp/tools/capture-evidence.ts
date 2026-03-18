import type { OverseerAdapter } from "../../adapter/core/adapter.ts";

export async function captureEvidenceTool(
  adapter: OverseerAdapter,
  input: { projectId?: string; conversationId?: string; taskId?: string }
) {
  return adapter.captureEvidence(input);
}
