import type { ConversationStatus } from "../../types/domain.ts";
import { normalizeVisibleText } from "./normalization.ts";

export interface ParsedStatus {
  status: ConversationStatus;
  confidence: number;
  cues: string[];
}

export function parseStatusFromVisibleText(visibleText: string): ParsedStatus {
  const normalized = normalizeVisibleText(visibleText).toLowerCase();
  const cues: string[] = [];

  if (!normalized) {
    return { status: "unknown", confidence: 0.2, cues: ["no_text"] };
  }

  if (normalized.includes("loading") || normalized.includes("thinking")) {
    cues.push("loading_text");
    return { status: "loading", confidence: 0.74, cues };
  }

  if (normalized.includes("done") || normalized.includes("completed")) {
    cues.push("completion_language");
    return { status: "completed", confidence: 0.76, cues };
  }

  if (normalized.includes("waiting") || normalized.includes("awaiting")) {
    cues.push("waiting_language");
    return { status: "idle", confidence: 0.66, cues };
  }

  cues.push("default_active");
  return { status: "active", confidence: 0.58, cues };
}
