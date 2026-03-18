import type { EvidenceRef } from "./evidence.ts";

export interface ToolResult<T> {
  ok: boolean;
  data: T;
  confidence: number;
  evidence: EvidenceRef[];
  warnings: string[];
}
