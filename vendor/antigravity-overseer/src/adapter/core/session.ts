export interface WindowSession {
  appName: string;
  windowTitle: string;
  attachedAt: string;
  status: "attached" | "unavailable";
}
