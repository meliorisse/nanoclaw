import { parseStatusFromVisibleText } from "../parsing/status-parser.ts";

export function detectUiState(visibleText: string) {
  const parsed = parseStatusFromVisibleText(visibleText);

  return {
    uiState: parsed.status,
    confidence: parsed.confidence,
    cues: parsed.cues
  };
}
