export interface EvidenceRef {
  snapshotId?: string;
  eventId?: string;
  filePath?: string;
}

export interface SnapshotRecord {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  taskId: string | null;
  screenshotPath: string | null;
  extractedText: string;
  uiState: string;
  confidence: number;
  createdAt: string;
}

export interface EvidenceCaptureResult {
  snapshot: SnapshotRecord;
  evidence: EvidenceRef[];
  warnings: string[];
}
